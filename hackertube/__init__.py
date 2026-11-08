"""Native registration for Hermes-owned search and model selection."""
from pathlib import Path
import sys


def register(ctx):
    root = str(Path(__file__).resolve().parent)
    if root not in sys.path:
        sys.path.insert(0, root)
    from hackertube_core.hermes import register as register_search
    register_search(ctx)
    from hackertube_core.search_worker import cli_main, setup_cli
    ctx.register_cli_command(name="hackertube-worker", help="Internal supervised media search", setup_fn=setup_cli, handler_fn=cli_main)
    from plugins.plugin_storage import plugin_data_dir
    from hackertube_core.search_jobs import stop_profile
    data_root = plugin_data_dir("hackertube").resolve()
    ctx.on_unload(lambda: stop_profile(data_root))
