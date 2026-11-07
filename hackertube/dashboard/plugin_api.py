"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. The declared secret
is read through ``agent.secret_scope.get_secret`` and is not written here.

``/catalog`` returns the seed ``hackertube_core`` loads. ``/feed`` reads
that seed through ``Catalog.feed`` and ``Catalog.section``, using the
interests and dismissals in the profile store. Ranking receives this
request's reference time and does not read the clock itself. The route
does not call a model or a search provider. ``/profile`` reads and writes the profile store in
the plugin data root. ``/sources`` reads and writes the stored source
choices and their last attempt, and ``/sources/refresh`` runs one bounded
ingestion pass through the request boundary. ``/search`` is the single
explicit focused Search: it runs only after the credit-use disclosure is
accepted, uses the plugin's selected provider, and stores its bounded job
through the profile store. The view modules are loaded by path because the
host loads this file as a script, not as a package.
"""

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agent.secret_scope import get_secret
from plugins.plugin_storage import plugin_data_dir

router = APIRouter()


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_catalog_view = _load_module(Path(__file__).with_name("catalog_view.py"), "hackertube_catalog_view")
_repo = str(_catalog_view.repo_root())
if _repo not in sys.path:
    sys.path.insert(0, _repo)
_discovery = _load_module(Path(__file__).with_name("discovery.py"), "hackertube_discovery")

_MODEL_KEY = "HACKERTUBE_MODEL_KEY"
_PLUGIN_ID = "hackertube"


def _model_key_state() -> str:
    value = get_secret(_MODEL_KEY)
    if isinstance(value, str) and value.strip():
        return "present"
    return "absent"


def _plugin_settings() -> dict:
    """The plugin's own declared settings from the profile config.

    Read through the published ``hermes_cli.config`` surface, the same way
    the settings hub reads and writes them. An absent or unexpected shape
    falls back to the declared defaults, and the default provider fails
    closed without a key, so the route never guesses a provider.
    """
    try:
        from hermes_cli.config import load_config_readonly

        config = load_config_readonly() or {}
    except Exception:
        # Hermes did not expose its config surface here. The declared
        # defaults apply: the live provider, which fails closed.
        return {}
    entry = ((config.get("plugins") or {}).get("entries") or {}).get(_PLUGIN_ID)
    if not isinstance(entry, dict):
        return {}
    settings = entry.get("settings")
    return settings if isinstance(settings, dict) else {}


def _provider_name(settings):
    """The selected provider name.

    A missing or undeclared name selects the key-gated live provider, so an
    unexpected setting value fails closed instead of silently selecting the
    free local provider.
    """
    from hackertube_core.search import PROVIDER_LIVE, PROVIDERS

    name = settings.get("provider")
    return name if name in PROVIDERS else PROVIDER_LIVE


def _search_binding():
    """The catalog, profile store, and selected provider for one Search.

    The provider name and endpoint come from the plugin's declared
    settings; an undeclared name falls back to the key-gated live provider,
    so a bad value fails closed.
    """
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.search import select_provider

    settings = _plugin_settings()
    endpoint = settings.get("model_endpoint")
    provider = select_provider(
        _provider_name(settings),
        get_secret=get_secret,
        endpoint=endpoint if isinstance(endpoint, str) else "",
    )
    return _catalog_view.load_catalog(), ProfileStore(open_profile_db), provider


@router.get("/status")
def status():
    root = plugin_data_dir("hackertube")
    return {
        "name": "HackerTube",
        "data_root": str(root),
        "model_key": _model_key_state(),
        "provider": _provider_name(_plugin_settings()),
    }


@router.get("/catalog")
def catalog():
    return _catalog_view.load_view()


@router.get("/feed")
def feed():
    """Ranked opening feed and format sections. Local reads only."""
    from hackertube_core.profile import utc_now

    store, _known_ids, _apply = _profile_binding()
    catalog = _catalog_view.load_catalog()
    return _discovery.discovery_dict(catalog, store.snapshot(), utc_now())


def _profile_binding():
    """Open the profile after the catalog view has put the repo on ``sys.path``."""
    catalog = _catalog_view.catalog_dict()
    from hackertube_core.profile import ProfileStore, apply_action, open_profile_db

    known_ids = {item["item_id"] for item in catalog["items"]}
    return ProfileStore(open_profile_db), known_ids, apply_action


def _profile_response(status, payload):
    return JSONResponse(status_code=status, content=payload)


@router.get("/profile")
def profile():
    store, _known_ids, _apply = _profile_binding()
    return store.snapshot()


async def _read_body(request: Request):
    try:
        body = await request.json()
    except Exception:
        return None
    return body


@router.post("/profile/saves")
async def profile_save(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(store, "save", await _read_body(request), known_ids)
    return _profile_response(status, payload)


@router.post("/profile/dismissals")
async def profile_dismiss(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(store, "dismiss", await _read_body(request), known_ids)
    return _profile_response(status, payload)


@router.post("/profile/opens")
async def profile_open(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(store, "open", await _read_body(request), known_ids)
    return _profile_response(status, payload)


@router.post("/profile/interests")
async def profile_interest(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(store, "interest", await _read_body(request), known_ids)
    return _profile_response(status, payload)


@router.get("/sources")
def sources():
    """Supported sources with their stored choice and last attempt."""
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.sources import source_snapshot

    return source_snapshot(ProfileStore(open_profile_db))


@router.post("/sources")
async def source_control(request: Request):
    """Enable or disable one supported source. An unsupported id is refused."""
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.sources import configure_source

    body = await _read_body(request)
    if not isinstance(body, dict):
        return _profile_response(400, {"error": "body"})
    status, payload = configure_source(
        ProfileStore(open_profile_db), body.get("source_id"), body.get("enabled")
    )
    return _profile_response(status, payload)


@router.post("/sources/refresh")
async def source_refresh(request: Request):
    """One bounded ingestion pass over the enabled sources.

    Every read goes through the request boundary and is counted free. A
    source that fails records its own error; the others still return. An
    optional ``{"query": "..."}`` body overrides the demo question.
    """
    from dataclasses import asdict

    from hackertube_core.profile import ProfileStore, open_profile_db, utc_now
    from hackertube_core.sources import ingest

    catalog = _catalog_view.load_catalog()
    body = await _read_body(request)
    query = body.get("query") if isinstance(body, dict) else None
    if not isinstance(query, str) or not query.strip():
        query = catalog.demo_question
    report = ingest(ProfileStore(open_profile_db), utc_now(), query)
    return {
        "schema": report["schema"],
        "query": report["query"],
        "sources": report["sources"],
        "items": [asdict(item) for item in report["items"]],
        "evidence": [asdict(row) for row in report["evidence"]],
        "request_counts": report["request_counts"],
    }


@router.get("/search")
def search_info():
    """The disclosure, the selected provider, and the last stored job.

    This route starts no work and makes no outbound call.
    """
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.search import DEFAULT_LIMITS, DISCLOSURE

    store = ProfileStore(open_profile_db)
    catalog, _store, provider = _search_binding()
    return {
        "schema": "hackertube.search/1",
        "disclosure": DISCLOSURE,
        "provider": provider.name,
        "model_key": _model_key_state(),
        "provider_available": provider.available(),
        "limits": DEFAULT_LIMITS.as_dict(),
        "demo_question": catalog.demo_question,
        "job": store.latest_job(),
    }


@router.post("/search")
async def search(request: Request):
    """Run the single explicit focused Search.

    The credit-use disclosure must be accepted before any provider
    activity, so a submit without it is refused and no job starts. A
    provider that cannot run is refused before any outbound call. The job
    is stored in the profile database through ``ProfileStore``.
    """
    from hackertube_core.errors import RecordError
    from hackertube_core.profile import utc_now
    from hackertube_core.search import (
        DEFAULT_LIMITS,
        DISCLOSURE,
        DisclosureRequired,
        ProviderUnavailable,
        run_search,
    )

    body = await _read_body(request)
    if not isinstance(body, dict):
        return _profile_response(400, {"error": "body"})
    catalog, store, provider = _search_binding()
    try:
        result = run_search(
            store,
            body.get("question"),
            catalog=catalog,
            profile=store.snapshot(),
            now=utc_now(),
            provider=provider,
            limits=DEFAULT_LIMITS,
            disclosure_accepted=body.get("disclosure_accepted"),
        )
    except DisclosureRequired as exc:
        return _profile_response(
            400,
            {"error": "disclosure_required", "message": str(exc), "disclosure": DISCLOSURE},
        )
    except RecordError:
        return _profile_response(400, {"error": "question"})
    except ProviderUnavailable as exc:
        return _profile_response(
            503,
            {
                "error": "provider_unavailable",
                "message": str(exc),
                "provider": provider.name,
                "model_key": _model_key_state(),
            },
        )
    return result
