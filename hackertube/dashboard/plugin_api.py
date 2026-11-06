"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. The declared secret
is read through ``agent.secret_scope.get_secret`` and is not written here.

``/catalog`` returns the seed ``hackertube_core`` loads. It does not rank
the feed and does not call a model or a search provider. ``/profile``
reads and writes the profile store in the plugin data root. The view
module is loaded by path because the host loads this file as a script,
not as a package.
"""

import importlib.util
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agent.secret_scope import get_secret
from plugins.plugin_storage import plugin_data_dir

router = APIRouter()

_VIEW_PATH = Path(__file__).with_name("catalog_view.py")
_view_spec = importlib.util.spec_from_file_location("hackertube_catalog_view", _VIEW_PATH)
if _view_spec is None or _view_spec.loader is None:
    raise ImportError("catalog view")
_catalog_view = importlib.util.module_from_spec(_view_spec)
_view_spec.loader.exec_module(_catalog_view)

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


def _profile_binding():
    """Open the profile after the catalog view has put the repo on ``sys.path``."""
    catalog = _catalog_view.catalog_dict()
    from hackertube_core.profile import ProfileStore, apply_action

    known_ids = {item["item_id"] for item in catalog["items"]}
    return ProfileStore(plugin_data_dir("hackertube")), known_ids, apply_action


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
