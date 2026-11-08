"""Profile-local dashboard routes mounted at /api/plugins/hackertube/.

The dashboard uses the inference/tool facades bound by native register(ctx),
not raw model credentials. One catalog loader serves merged local records to
catalog, feed, search, and library actions; only explicit work retrieves data.
Live searches run in killable worker groups. Only supervision/storage waits
use the ASGI worker pool; provider code never runs in the dashboard process.
"""

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from agent.secret_scope import get_secret
from plugins.plugin_storage import plugin_data_dir

def _require_privacy(request: Request):
    if request.scope["route"].endpoint in {privacy, privacy_agreement, privacy_delete}:
        return
    from hackertube_core.profile import ProfileStore, open_profile_db
    if not ProfileStore(open_profile_db).privacy_accepted():
        raise HTTPException(status_code=403, detail="privacy_agreement_required")


router = APIRouter(dependencies=[Depends(_require_privacy)])


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_catalog_view = _load_module(
    Path(__file__).with_name("catalog_view.py"), "hackertube_catalog_view"
)
_repo = str(_catalog_view.plugin_root())
if _repo not in sys.path:
    sys.path.insert(0, _repo)
_discovery = _load_module(
    Path(__file__).with_name("discovery.py"), "hackertube_discovery"
)

_PLUGIN_ID = "hackertube"


def _load_catalog():
    from hackertube_core.profile import ProfileStore, open_profile_db

    return _catalog_view.load_catalog(ProfileStore(open_profile_db))


def _plugin_settings() -> dict:
    """The plugin's own declared settings from the profile config.

    Read through the published ``hermes_cli.config`` surface, the same way
    the settings hub reads and writes them. An absent or unexpected shape
    falls back to the declared defaults, and inference stays with Hermes unless offline development selects the stub.
    """
    try:
        from hermes_cli.config import load_config_readonly

        config = load_config_readonly() or {}
    except Exception:
        # Hermes did not expose its config surface here. The declared
        # defaults apply: the Hermes provider.
        return {}
    entry = ((config.get("plugins") or {}).get("entries") or {}).get(_PLUGIN_ID)
    if not isinstance(entry, dict):
        return {}
    settings = entry.get("settings")
    return settings if isinstance(settings, dict) else {}


def _provider_name(settings):
    """The selected provider name.

    A missing or old live setting selects Hermes, preserving host-owned auth.
    """
    from hackertube_core.search import PROVIDER_STUB

    name = settings.get("provider")
    return "stub" if name == PROVIDER_STUB else "hermes"


def _search_binding():
    """The catalog, profile store, and selected provider for one Search.

    The model route belongs to the plugin's registered Hermes auxiliary slot.
    """
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.search import select_provider

    settings = _plugin_settings()
    provider = select_provider(_provider_name(settings))
    return _load_catalog(), ProfileStore(open_profile_db), provider


def _supervisor(store):
    from hermes_constants import get_hermes_home
    from hackertube_core.search_jobs import supervisor_for_profile
    return supervisor_for_profile(store, home=get_hermes_home(), identity=plugin_data_dir("hackertube"))


@router.get("/privacy")
def privacy():
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.privacy import policy
    return {**policy(), "accepted": ProfileStore(open_profile_db).privacy_accepted()}


@router.post("/privacy")
async def privacy_agreement(request: Request):
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.privacy import VERSION
    body = await _read_body(request)
    if not isinstance(body, dict) or body.get("accepted") is not True or body.get("version") != VERSION:
        return _profile_response(400, {"error": "privacy_agreement"})
    ProfileStore(open_profile_db).accept_privacy(VERSION)
    return privacy()


@router.post("/privacy/delete")
async def privacy_delete():
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.search_jobs import SearchBusy
    try:
        await run_in_threadpool(_supervisor(ProfileStore(open_profile_db)).clear_data)
    except SearchBusy:
        return _profile_response(409, {"error": "search_busy", "message": "Cancel the active Search before deleting HackerTube data."})
    return privacy()


@router.get("/search/jobs/{job_id}")
def search_job(job_id: str):
    from hackertube_core.profile import ProfileStore, open_profile_db
    result = _supervisor(ProfileStore(open_profile_db)).status(job_id)
    if result is None:
        return _profile_response(404, {"error": "job_not_found"})
    if result["job"]["state"] not in {"queued", "running", "cancelling"}:
        from hackertube_core.catalog_store import document
        result["catalog"] = document(_load_catalog())
    return result


@router.post("/search/jobs/{job_id}/cancel")
async def cancel_search(job_id: str):
    from hackertube_core.profile import ProfileStore, open_profile_db
    result = await run_in_threadpool(_supervisor(ProfileStore(open_profile_db)).cancel, job_id)
    if result is None:
        return _profile_response(404, {"error": "job_not_found"})
    return result


@router.get("/status")
def status():
    root = plugin_data_dir("hackertube")
    return {
        "name": "HackerTube",
        "data_root": str(root),
        "provider": _provider_name(_plugin_settings()),
    }


@router.get("/catalog")
def catalog():
    from hackertube_core.catalog_store import document

    return {"catalog": document(_load_catalog())}


@router.get("/feed")
def feed():
    """Ranked opening feed and format sections. Local reads only."""
    from hackertube_core.profile import utc_now

    store, _known_ids, _apply = _profile_binding()
    catalog = _load_catalog()
    return _discovery.discovery_dict(catalog, store.snapshot(), utc_now())


def _profile_binding():
    """Open the profile after the catalog view has put the repo on ``sys.path``."""
    from hackertube_core.catalog_store import document

    catalog = document(_load_catalog())
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
    status, payload = apply_action(
        store, "dismiss", await _read_body(request), known_ids
    )
    return _profile_response(status, payload)


@router.post("/profile/opens")
async def profile_open(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(store, "open", await _read_body(request), known_ids)
    return _profile_response(status, payload)


@router.post("/profile/interests")
async def profile_interest(request: Request):
    store, known_ids, apply_action = _profile_binding()
    status, payload = apply_action(
        store, "interest", await _read_body(request), known_ids
    )
    return _profile_response(status, payload)


@router.get("/sources")
def sources():
    """Supported sources with their stored choice and last attempt."""
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.sources import source_snapshot, available_registry

    return source_snapshot(
        ProfileStore(open_profile_db), available_registry(get_secret)
    )


@router.post("/sources")
async def source_control(request: Request):
    """Enable or disable one supported source. An unsupported id is refused."""
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.sources import configure_source, available_registry

    body = await _read_body(request)
    if not isinstance(body, dict):
        return _profile_response(400, {"error": "body"})
    status, payload = configure_source(
        ProfileStore(open_profile_db),
        body.get("source_id"),
        body.get("enabled"),
        registry=available_registry(get_secret),
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

    catalog = _load_catalog()
    body = await _read_body(request)
    query = body.get("query") if isinstance(body, dict) else None
    if not isinstance(query, str) or not query.strip():
        query = catalog.demo_question
    report = ingest(ProfileStore(open_profile_db), utc_now(), query, get_secret=get_secret)
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
    from hackertube_core.search import DEFAULT_LIMITS, LIVE_LIMITS, DISCLOSURE

    store = ProfileStore(open_profile_db)
    catalog, _store, provider = _search_binding()
    job = store.latest_job()
    if job and job["state"] in {"queued", "running", "cancelling"}:
        # Recovery is local and still works if the configured provider is gone
        # or the user has selected the offline provider since the last job.
        _supervisor(store).recover()
        job = store.latest_job()
    return {
        "schema": "hackertube.search/1",
        "disclosure": DISCLOSURE,
        "provider": provider.name,
        "provider_available": provider.available(),
        "limits": (
            DEFAULT_LIMITS if provider.name == "stub" else LIVE_LIMITS
        ).as_dict(),
        "demo_question": catalog.demo_question,
        "job": job,
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
        LIVE_LIMITS,
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
        from hackertube_core.search import canonical_question
        from hackertube_core.search_jobs import SearchBusy
        if body.get("disclosure_accepted") is not True:
            raise DisclosureRequired("Accept the credit-use disclosure before Search.")
        question = canonical_question(body.get("question"))
        if not provider.available():
            raise ProviderUnavailable("The Hermes search service is unavailable. No request was sent.")
        limits = DEFAULT_LIMITS if provider.name == "stub" else LIVE_LIMITS
        if provider.name != "stub" or body.get("background") is True:
            manager = _supervisor(store)
            try:
                job = await run_in_threadpool(manager.start, question, provider=provider.name,
                    limits=limits, disclosure_accepted=True)
            except SearchBusy:
                return _profile_response(409, {"error": "search_busy", "job": store.latest_job()})
            if body.get("background") is True:
                return _profile_response(202, manager.status(job["job_id"]))
            await run_in_threadpool(manager.wait, job["job_id"], limits.deadline_seconds + 1.5)
            result = manager.status(job["job_id"])
        else:
            # Compatibility for deterministic, offline API fixtures. The UI
            # always requests supervised execution, including its stub mode.
            result = await run_in_threadpool(run_search, store, question,
                catalog=catalog, profile=store.snapshot(), now=utc_now(), provider=provider,
                limits=limits, disclosure_accepted=True)
    except DisclosureRequired as exc:
        return _profile_response(400, {"error": "disclosure_required", "message": str(exc), "disclosure": DISCLOSURE})
    except RecordError:
        return _profile_response(400, {"error": "question"})
    except ProviderUnavailable as exc:
        return _profile_response(503, {"error": "provider_unavailable", "message": str(exc), "provider": provider.name})
    from hackertube_core.catalog_store import document

    result["catalog"] = document(_load_catalog())
    return result
