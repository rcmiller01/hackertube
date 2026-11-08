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


def test_reasoning_model_has_room_to_return_a_ranking_after_2500_tokens(monkeypatch, tmp_path):
    from hackertube_core.catalog import load_seed
    from hackertube_core.hermes import HermesProvider
    from hackertube_core.search import LIVE_LIMITS, run_search
    from test_search import NOW, one_book, profile, store_at

    monkeypatch.setitem(sys.modules, 'hermes_constants', SimpleNamespace(
        get_hermes_home=lambda: '/reasoning-dashboard'))
    calls = []

    def complete_structured(**kw):
        calls.append(kw)
        value = json.loads(kw['input'][0]['text'])
        if isinstance(value, str):
            parsed = {'topic': 'gardening', 'terms': ['gardening'], 'formats': ['book']}
        else:
            # Observed host shape: no final text/parsed data when reasoning
            # consumes the 2,500-token completion budget (finish_reason=length).
            parsed = None if kw['max_tokens'] <= 2500 else {
                'items': [{'item_id': 'ol:1', 'reason': 'A beginner gardening book.'}]}
        return SimpleNamespace(parsed=parsed, provider='configured', model='reasoning',
                               usage=SimpleNamespace(cost_usd=None))

    unload = []
    register(SimpleNamespace(register_auxiliary_task=lambda *a, **k: None,
                             on_unload=unload.append,
                             llm=SimpleNamespace(complete_structured=complete_structured)))
    try:
        result = run_search(store_at(tmp_path), 'gardening books', catalog=load_seed(),
                            profile=profile(), now=NOW, provider=HermesProvider(),
                            retriever=lambda *args: (one_book(), []), limits=LIVE_LIMITS,
                            disclosure_accepted=True)
        assert result['job']['state'] == 'succeeded'
        assert [r['item_id'] for r in result['results']] == ['ol:1']
        assert len(calls) == 2  # No silent retry or fallback to unranked records.
        assert all(0 < c['timeout'] <= 45 for c in calls)
    finally:
        unload[0]()
