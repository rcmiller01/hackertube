"""Teardown probe: which host stubs remain in sys.modules after each test.

Run as: python -m pytest -p teardown_probe ...
Uses a hookwrapper so the check runs AFTER fixture finalisation (monkeypatch undo).
"""

import sys

import pytest

NAMES = [
    "agent",
    "agent.secret_scope",
    "plugins",
    "plugins.plugin_storage",
    "hermes_cli",
    "hermes_cli.config",
]


def pytest_sessionstart(session):
    print("[teardown_probe] before_session=", [n for n in NAMES if n in sys.modules])


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item, nextitem):
    yield
    leaked = [n for n in NAMES if n in sys.modules]
    if leaked:
        print(f"[teardown_probe] leaked_after_teardown {item.nodeid}: {leaked}")


def pytest_sessionfinish(session, exitstatus):
    print("[teardown_probe] leaked_after_session=", [n for n in NAMES if n in sys.modules])
