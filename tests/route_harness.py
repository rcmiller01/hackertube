"""Drive the real dashboard routes without the Hermes host.

The task 3.3 and 4.1/4.2 receipts need the save, dismiss, open, and search
routes, the profile store, and the feed read to be executed as production
executes them. Three host seams are substituted here and nothing else:

- ``agent.secret_scope.get_secret`` reports no secret, so the model-key
  state is ``absent`` and no credential is read.
- ``plugins.plugin_storage`` points at a temporary data root. The
  production ``plugin_db`` returns a Hermes-managed sqlite connection; this
  one returns a plain ``sqlite3`` connection to the same file name, so
  ``ProfileStore`` above it runs unchanged.
- ``hermes_cli.config.load_config_readonly`` returns the plugin's declared
  settings. The suite virtualenv cannot import the real Hermes config, and
  the route reads settings only through that published surface. The default
  is the deterministic stub provider, so the search route runs no provider
  call and no outbound request.

``hackertube/dashboard/plugin_api.py`` is loaded from disk exactly as the
host loads it, and its router is mounted on a FastAPI app. Nothing in
``hackertube_core`` or ``hackertube/dashboard`` is patched: the routes,
``apply_action``, the ``ProfileStore`` writes, ``discovery_dict``, and
``run_search`` are the production code.
"""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_API = ROOT / "hackertube" / "dashboard" / "plugin_api.py"
API_ROOT = "/api/plugins/hackertube"

#: The declared plugin settings the routes read. The demo cut runs the
#: deterministic stub provider, which makes no outbound call.
DEFAULT_SETTINGS = {"provider": "stub", "model_endpoint": ""}

#: The declared secrets the route reads through secret scope. Empty by
#: default, so the model key is absent and no credential exists. A test
#: sets ``SECRETS`` to drive the live provider's other path. Nothing here
#: is read from a file.
SECRETS = {}


def install_host(data_root, settings=None, *, monkeypatch=None):
    """Put the host modules in ``sys.modules`` for a temporary root.

    ``settings`` is the plugin's declared settings mapping. The default is
    the stub provider; pass ``{"provider": "live"}`` to drive the keyed
    provider's fail-closed path.

    The required ``monkeypatch`` installs the stubs through
    ``monkeypatch.setitem``: pytest restores whatever was in ``sys.modules``
    before the test (usually nothing) at teardown, so the stub does not leak
    into later tests. There is no unscoped installation path: ``None`` (or an
    omitted value) is refused explicitly, because installing a host stub
    directly is exactly the leak this harness fixed.
    """
    if monkeypatch is None:
        raise TypeError("monkeypatch is required")
    root = Path(data_root)
    root.mkdir(parents=True, exist_ok=True)

    agent = types.ModuleType("agent")
    secrets = types.ModuleType("agent.secret_scope")
    secrets.get_secret = lambda name: SECRETS.get(name)
    agent.secret_scope = secrets

    plugins = types.ModuleType("plugins")
    storage = types.ModuleType("plugins.plugin_storage")
    storage.plugin_data_dir = lambda name: root

    def plugin_db(name, filename="profile.db"):
        connection = sqlite3.connect(str(root / filename))
        connection.row_factory = sqlite3.Row
        return connection

    storage.plugin_db = plugin_db
    plugins.plugin_storage = storage

    hermes_cli = types.ModuleType("hermes_cli")
    config_module = types.ModuleType("hermes_cli.config")
    entry = {"settings": dict(DEFAULT_SETTINGS if settings is None else settings)}

    def load_config_readonly():
        return {"plugins": {"entries": {"hackertube": entry}}}

    config_module.load_config_readonly = load_config_readonly
    hermes_cli.config = config_module

    stubs = {
        "agent": agent,
        "agent.secret_scope": secrets,
        "plugins": plugins,
        "plugins.plugin_storage": storage,
        "hermes_cli": hermes_cli,
        "hermes_cli.config": config_module,
    }
    for name, module in stubs.items():
        monkeypatch.setitem(sys.modules, name, module)
    return root


def load_api(name="hackertube_plugin_api_under_test"):
    """Import the dashboard API from disk and mount its router."""
    from fastapi import FastAPI

    spec = importlib.util.spec_from_file_location(name, PLUGIN_API)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix=API_ROOT)
    return module, app


def client(app):
    """A TestClient for the mounted router. In-process, no socket, no server."""
    from fastapi.testclient import TestClient

    return TestClient(app)


class Dashboard:
    """One dashboard process: a router load plus a client, over one data root."""

    def __init__(self, data_root, name="hackertube_plugin_api_under_test", settings=None, *, monkeypatch=None):
        if monkeypatch is None:
            raise TypeError("monkeypatch is required")
        self.root = install_host(data_root, settings=settings, monkeypatch=monkeypatch)
        self.module, self.app = load_api(name)
        self.http = client(self.app)
        from hackertube_core.privacy import VERSION
        agreed = self.post("/privacy", {"version": VERSION, "accepted": True})
        assert agreed.status_code == 200

    def get(self, path, **kwargs):
        return self.http.get(API_ROOT + path, **kwargs)

    def post(self, path, body):
        return self.http.post(API_ROOT + path, json=body)

    def close(self):
        """Release the client if it was entered; nothing to do otherwise."""
        close = getattr(self.http, "close", None)
        if callable(close):
            close()


def start(data_root, name="hackertube_plugin_api_under_test", settings=None, *, monkeypatch=None):
    """Load the plugin over ``data_root``.

    Pass the test's ``monkeypatch`` fixture so the host stubs are registered
    through ``monkeypatch.setitem`` and pytest removes them at teardown: the
    route tests then restore the prior state of ``sys.modules``. Omitting
    ``monkeypatch`` (or passing ``None``) is refused with a ``TypeError``
    rather than running an unscoped installation.
    """
    if monkeypatch is None:
        raise TypeError("monkeypatch is required")
    return Dashboard(data_root, name=name, settings=settings, monkeypatch=monkeypatch)
