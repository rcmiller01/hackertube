"""Offline clean-profile route smoke test with the real Hermes storage/config.

Run with Hermes's Python runtime. Creates an isolated profile in this worktree's
ignored .venv directory, copies only this plugin, enables via CLI, then exercises
in-process routes. This is not a gateway/browser or live-inference test.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
AGENT = Path.home() / ".hermes/hermes-agent"


def main():
    # Re-exec with an explicit environment allowlist. No inherited provider
    # credentials, dotenv file or existing user-profile config is copied.
    if "--isolated" not in sys.argv:
        home = Path(tempfile.mkdtemp(prefix="polish-profile-", dir=ROOT / ".venv"))
        plugin = home / "plugins/hackertube"
        shutil.copytree(ROOT / "hackertube", plugin, ignore=shutil.ignore_patterns("__pycache__"))
        env = {name: os.environ[name] for name in ("PATH", "HOME", "TMPDIR") if name in os.environ}
        env.update(HERMES_HOME=str(home), PYTHONPATH=str(AGENT))
        enabled = subprocess.run(["hermes", "plugins", "enable", "hackertube", "--no-allow-tool-override"],
                                 env=env, text=True, capture_output=True, check=True)
        listing = subprocess.run(["hermes", "plugins", "list", "--enabled", "--json"],
                                 env=env, text=True, capture_output=True, check=True)
        child = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--isolated"],
                               env=env, text=True, capture_output=True)
        enabled_rows = [row for row in json.loads(listing.stdout) if row["name"] == "hackertube"]
        assert len(enabled_rows) == 1 and enabled_rows[0]["status"] == "enabled"
        print(json.dumps({"profile": str(home), "enable_output": enabled.stdout,
                          "enabled_listing": enabled_rows, "route_result": json.loads(child.stdout) if child.returncode == 0 else child.stdout,
                          "route_stderr": child.stderr, "exit": child.returncode}, indent=2))
        return child.returncode

    sys.path.insert(0, str(AGENT))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from hermes_constants import get_hermes_home
    from hermes_cli.plugins_state import save_plugin_setting
    from plugins.plugin_storage import plugin_data_dir
    home = Path(os.environ["HERMES_HOME"]).resolve()
    assert Path(get_hermes_home()).resolve() == home
    assert plugin_data_dir("hackertube").resolve().is_relative_to(home)
    def refuse_network(*args, **kwargs):
        raise AssertionError("network forbidden in clean profile probe")
    socket.getaddrinfo = refuse_network
    socket.socket.connect = refuse_network
    socket.socket.connect_ex = refuse_network

    def mount(name):
        spec = importlib.util.spec_from_file_location(name, home / "plugins/hackertube/dashboard/plugin_api.py")
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        app = FastAPI()
        app.include_router(module.router, prefix="/api/plugins/hackertube")
        return TestClient(app)
    client = mount("polish_keyless")
    from hackertube_core import outbound
    policy = client.get("/api/plugins/hackertube/privacy").json()
    accepted = client.post("/api/plugins/hackertube/privacy", json={"version":policy["version"],"accepted":True})
    assert accepted.status_code == 200 and accepted.json()["accepted"]
    question = {"question":"What can I read by Jane Austen?", "disclosure_accepted":True}
    outbound.reset()
    refused = client.post("/api/plugins/hackertube/search",json=question)
    assert refused.status_code == 503 and refused.json()["error"] == "provider_unavailable"
    assert outbound.counters() == {"free":0,"paid":0,"metered":0}
    save_plugin_setting("hackertube", ("provider",), "stub")
    client = mount("polish_stub")
    result = client.post("/api/plugins/hackertube/search",json=question)
    body = result.json()
    assert result.status_code == 200 and body["provider"] == "stub" and body["job"]["state"] == "succeeded"
    assert outbound.counters() == {"free":0,"paid":0,"metered":0}
    print(json.dumps({"agreement":True,"keyless_status":refused.status_code,"keyless_body":refused.json(),
                      "stub_status":result.status_code,"stub_state":body["job"]["state"],
                      "stub_results":len(body.get("results",[])),"request_counts":outbound.counters()},indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
