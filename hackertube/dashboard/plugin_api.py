"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. The declared secret
is read through ``agent.secret_scope.get_secret`` and is not written here.
"""

from fastapi import APIRouter

from agent.secret_scope import get_secret
from plugins.plugin_storage import plugin_data_dir

router = APIRouter()

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
