"""Dashboard backend mounted at /api/plugins/hackertube/.

The host imports this module and mounts ``router``. It does not pass a
plugin context, so ``ctx.llm`` and ``ctx.dispatch_tool`` are not available
here. Profile data belongs under the plugin data root. Declared secrets
are read through ``agent.secret_scope.get_secret`` and are not written here.
"""

from fastapi import APIRouter

from plugins.plugin_storage import plugin_data_dir

router = APIRouter()


@router.get("/status")
def status():
    root = plugin_data_dir("hackertube")
    return {"name": "HackerTube", "data_root": str(root)}
