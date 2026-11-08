"""Cold dashboard regressions discovered by the installed live walkthrough."""

import json
import sys
from types import SimpleNamespace

from hackertube_core.hermes import register, web_search


def test_explicit_web_search_discovers_host_tools_on_a_cold_dashboard(monkeypatch):
    events = []
    monkeypatch.setitem(sys.modules, 'hermes_constants', SimpleNamespace(
        get_hermes_home=lambda: '/cold-dashboard'))
    monkeypatch.setitem(sys.modules, 'tools', SimpleNamespace())
    monkeypatch.setitem(sys.modules, 'tools.registry', SimpleNamespace(
        discover_builtin_tools=lambda: events.append('discover')))

    def dispatch(name, args, **kwargs):
        events.append('dispatch')
        assert events == ['discover', 'dispatch'], 'cold dashboard has no web_search tool'
        assert name == 'web_search' and args == {'query': 'gardening books', 'limit': 8}
        assert kwargs == {'execution_timeout': 2}
        return json.dumps({'success': True, 'data': {'web': [{'url': 'https://openlibrary.org/works/OL1W'}]}})

    unload = []
    register(SimpleNamespace(register_auxiliary_task=lambda *a, **k: None,
                             on_unload=unload.append, dispatch_tool=dispatch))
    assert events == []  # Opening/loading the plugin does not discover or invoke tools.
    try:
        assert web_search('gardening books', timeout=2) == [{'url': 'https://openlibrary.org/works/OL1W'}]
    finally:
        unload[0]()
