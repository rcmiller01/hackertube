"""Contracts for the test host itself, including its post-teardown state."""
import sys
import types

import pytest

import route_harness

HOST_MODULES = (
    "agent", "agent.secret_scope", "plugins", "plugins.plugin_storage",
    "hermes_cli", "hermes_cli.config",
)


@pytest.mark.parametrize("preexisting", [False, True])
def test_start_restores_all_six_host_modules_after_teardown(tmp_path, monkeypatch, preexisting):
    # Cover both deletion of new modules and identity restoration of existing
    # ones. The OUTER fixture cleans up even when the post-teardown check fails.
    for name in HOST_MODULES:
        if preexisting:
            monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
        else:
            monkeypatch.delitem(sys.modules, name, raising=False)
    before = {name: sys.modules.get(name) for name in HOST_MODULES}
    with pytest.MonkeyPatch.context() as host_patch:
        dashboard = route_harness.start(tmp_path, monkeypatch=host_patch)
        try:
            assert all(sys.modules[name] is not before[name] for name in HOST_MODULES)
            assert dashboard.get("/profile").status_code == 200
        finally:
            dashboard.close()
    leaked = [name for name in HOST_MODULES if sys.modules.get(name) is not before[name]]
    assert leaked == [], f"host stubs survived teardown: {leaked}"


@pytest.mark.parametrize("factory", [route_harness.start, route_harness.install_host, route_harness.Dashboard])
@pytest.mark.parametrize("call", ["omitted", "explicit_none"])
def test_host_entry_points_require_monkeypatch(tmp_path, factory, call):
    # Both ways an unscoped installation can be requested: the argument left
    # out, and the argument passed as None. Each must raise the SAME explicit
    # TypeError with the exact message, so a guard that is absent, wrong-typed,
    # or worded differently fails this test.
    kwargs = {} if call == "omitted" else {"monkeypatch": None}
    with pytest.raises(TypeError) as excinfo:
        factory(tmp_path, **kwargs)
    assert str(excinfo.value) == "monkeypatch is required"
