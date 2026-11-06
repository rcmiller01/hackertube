"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. The declared secret
is read through ``agent.secret_scope.get_secret`` and is not written here.

``/catalog`` returns the local fixture through ``catalog_adapter``. It does
not import ``hackertube_core``, does not rank the feed, and does not call a
model or a search provider.
"""

import importlib.util
from pathlib import Path

from fastapi import APIRouter

from agent.secret_scope import get_secret
from plugins.plugin_storage import plugin_data_dir

router = APIRouter()

_ADAPTER_PATH = Path(__file__).with_name("catalog_adapter.py")
_adapter_spec = importlib.util.spec_from_file_location(
    "hackertube_catalog_adapter", _ADAPTER_PATH
)
if _adapter_spec is None or _adapter_spec.loader is None:
    raise ImportError("catalog adapter")
_catalog_adapter = importlib.util.module_from_spec(_adapter_spec)
_adapter_spec.loader.exec_module(_catalog_adapter)

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
    return _catalog_adapter.load_view()
