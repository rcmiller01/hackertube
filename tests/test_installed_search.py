"""Cold dashboard regressions discovered by the installed live walkthrough."""

import json
import sys
from types import SimpleNamespace

from hackertube_core.hermes import register, web_search
import pytest


@pytest.fixture(autouse=True)
def agreed_host(tmp_path, monkeypatch):
    import route_harness
    from hackertube_core.profile import ProfileStore, open_profile_db
    from hackertube_core.privacy import VERSION
    route_harness.install_host(tmp_path / "host", monkeypatch=monkeypatch)
    ProfileStore(open_profile_db).accept_privacy(VERSION)


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
                'items': [{'item_id': 'ol:1', 'reason': 'A beginner gardening book.', 'fit': 'direct'}]}
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


def test_four_format_ranking_survives_the_observed_8000_token_exhaustion(monkeypatch):
    from dataclasses import replace
    from hackertube_core.hermes import HermesProvider
    from test_search import one_book

    monkeypatch.setitem(sys.modules, 'hermes_constants', SimpleNamespace(
        get_hermes_home=lambda: '/four-format-dashboard'))
    base = one_book()
    formats = ['video', 'podcast_show', 'book', 'audiobook']
    catalog = replace(base, items=tuple(
        replace(base.items[0], item_id=f'candidate:{i}', identifiers=(f'candidate:{i}',), format=formats[i % 4])
        for i in range(57)))
    calls = []

    def complete_structured(**kw):
        calls.append(kw)
        candidates = json.loads(kw['input'][0]['text'])['candidates']
        assert len(candidates) == 57  # Preserve retrieval recall across all formats.
        # The live reasoning provider exhausted 8,000 completion tokens on
        # 57 candidates and returned no final text or parsed object.
        parsed = None if kw['max_tokens'] <= 8000 else {'items': [
            {'item_id': c['item_id'], 'reason': 'Accessible AI introduction.', 'fit': 'direct'}
            for c in candidates[:4]]}
        return SimpleNamespace(parsed=parsed, provider='configured', model='reasoning',
                               usage=SimpleNamespace(cost_usd=None))

    unload = []
    register(SimpleNamespace(register_auxiliary_task=lambda *a, **k: None,
                             on_unload=unload.append,
                             llm=SimpleNamespace(complete_structured=complete_structured)))
    try:
        ranked, cost = HermesProvider().rank('AI introductions in all formats', catalog, 30)
        assert set(ranked) == {'candidate:0', 'candidate:1', 'candidate:2', 'candidate:3'}
        assert len(calls) == 1 and cost is None
        assert calls[0]['max_tokens'] <= 16000 and calls[0]['timeout'] == 30
    finally:
        unload[0]()


def test_interpretation_allows_reasoning_before_structured_answer(monkeypatch):
    from hackertube_core.hermes import HermesProvider
    from hackertube_core.search import LIVE_LIMITS

    monkeypatch.setitem(sys.modules, "hermes_constants", SimpleNamespace(
        get_hermes_home=lambda: "/interpretation-dashboard"))
    calls = []

    def complete_structured(**kw):
        calls.append(kw)
        # Installed job:14 returned text rather than JSON at the 2,500-token
        # allowance. Reproduce a reasoning model exhausting that allowance.
        parsed = None if kw["max_tokens"] <= 2500 else {
            "topic": "AI for nontechnical beginners, excluding coding and news",
            "retrieval_query": "artificial intelligence",
            "terms": ["artificial intelligence"], "depth": "beginner",
            "formats": ["video", "podcast_show", "book", "audiobook"],
        }
        return SimpleNamespace(parsed=parsed, provider="configured", model="reasoning",
                               usage=SimpleNamespace(cost_usd=None))

    unload = []
    register(SimpleNamespace(register_auxiliary_task=lambda *a, **k: None,
                             on_unload=unload.append,
                             llm=SimpleNamespace(complete_structured=complete_structured)))
    try:
        result = HermesProvider().interpret(
            "AI for nontechnical beginners, no coding or daily news", LIVE_LIMITS)
        assert result.interpretation.retrieval_query == "artificial intelligence"
        assert result.interpretation.depth == "beginner"
        assert len(calls) == 1  # No retry, silent fallback, or extra model request.
        assert 0 < calls[0]["timeout"] <= 45
        assert calls[0]["max_tokens"] <= 8000
    finally:
        unload[0]()
