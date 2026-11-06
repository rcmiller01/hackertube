"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. The declared secret
is read through ``agent.secret_scope.get_secret`` and is not written here.

``/catalog`` returns the seed ``hackertube_core`` loads. It does not rank
the feed and does not call a model or a search provider. The view module is
loaded by path because the host loads this file as a script, not as a
package.
"""

import importlib.util
from pathlib import Path

from fastapi import APIRouter

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
