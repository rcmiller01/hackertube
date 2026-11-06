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
the plugin data root. The view modules are loaded by path because the
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


def _model_key_state() -> str:
    value = get_secret(_MODEL_KEY)
    if isinstance(value, str) and value.strip():
        return "present"
    return "absent"


@router.get("/status")
def status():
    root = plugin_data_dir("hackertube")
    return {
        "name": "HackerTube",
        "data_root": str(root),
        "model_key": _model_key_state(),
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
