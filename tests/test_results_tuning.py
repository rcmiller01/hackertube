"""Public search/ranking regressions motivated by the installed AI results."""

import json
from collections import Counter
from urllib.parse import parse_qs, urlsplit

import pytest

from hackertube_core.hermes import HermesProvider
from hackertube_core.retrieval import Budget, SourceRetriever
from hackertube_core.search import LIVE_LIMITS, ProviderUnavailable, interpret_question, result_set, run_search
from test_search import NOW, build, evidence, item, one_book, profile, source, store_at


def catalog_for(formats):
    items = [item(f'media:{i}', fmt, 'Artificial intelligence introduction',
                  capture_order=i + 1, duration_seconds=600)
             for i, fmt in enumerate(formats)]
    return build(items, [evidence(f'e{i}', row['item_id']) for i, row in enumerate(items)],
                 [source('openlibrary', 'Test catalog')])


def test_subject_query_is_kept_separate_from_audience_and_exclusions(tmp_path, monkeypatch):
    seen = []

    def invoke(raw):
        return {'data': {'topic': 'AI for nontechnical beginners without coding or daily news',
                         'retrieval_query': 'artificial intelligence',
                         'terms': ['artificial intelligence'], 'formats': ['book'],
                         'depth': 'beginner'}}

    outcome = HermesProvider(invoke).interpret('AI for nontechnical beginners, no coding or daily news', LIVE_LIMITS)

    def read(url, **kwargs):
        seen.append(parse_qs(urlsplit(url).query))
        return {'docs': []} if 'openlibrary.org' in url else {'hits': []}

    monkeypatch.setattr('hackertube_core.retrieval.read_json', read)
    SourceRetriever(store_at(tmp_path))(outcome.interpretation, NOW, Budget(LIVE_LIMITS))
    assert seen and all((q.get('q') or q.get('query')) == ['artificial intelligence'] for q in seen)
    assert outcome.interpretation.as_dict()['retrieval_query'] == 'artificial intelligence'
    assert outcome.interpretation.depth == 'beginner'


@pytest.mark.parametrize('bad', ['', [], '<unsafe>', 'x' * 201])
def test_invalid_subject_query_is_refused(bad):
    provider = HermesProvider(lambda raw: {'data': {
        'topic': 'AI', 'retrieval_query': bad, 'terms': ['AI'], 'formats': ['book']}})
    with pytest.raises(ProviderUnavailable):
        provider.interpret('AI books', LIVE_LIMITS)


@pytest.mark.parametrize('bad_row', [
    {'item_id': 'invented', 'reason': 'Not retrieved.', 'fit': 'direct'},
    {'item_id': 'media:1', 'reason': '', 'fit': 'direct'},
    {'item_id': 'media:1', 'reason': 'Unvalidated fit.'},
])
def test_one_bad_ranked_entry_does_not_discard_valid_recommendations(bad_row):
    cat = catalog_for(['book', 'video', 'audiobook'])
    provider = HermesProvider(lambda raw: {'data': {'items': [
        {'item_id': 'media:0', 'reason': 'Direct introduction.', 'fit': 'direct'},
        bad_row,
        {'item_id': 'media:2', 'reason': 'Actual introductory audio edition.', 'fit': 'direct'},
    ]}})
    ranked, _ = provider.rank('AI introductions', cat, 10)
    assert list(ranked) == ['media:0', 'media:2']
    assert provider.ranking_diagnostics['invalid_entries'] == 1


@pytest.mark.parametrize('fmt', ['video', 'podcast_show', 'book', 'audiobook'])
def test_related_or_uncertain_material_is_not_presented_as_a_direct_match(fmt):
    cat = catalog_for([fmt, fmt, fmt])
    provider = HermesProvider(lambda raw: {'data': {'items': [
        {'item_id': 'media:0', 'reason': 'Only tangentially related.', 'fit': 'related'},
        {'item_id': 'media:1', 'reason': 'Audience suitability unknown.', 'fit': 'uncertain'},
        {'item_id': 'media:2', 'reason': 'Directly addresses the request.', 'fit': 'direct'},
    ]}})
    ranked, _ = provider.rank('AI introductions', cat, 10)
    assert list(ranked) == ['media:2']
    assert provider.ranking_diagnostics['not_recommended'] == 2


def test_result_cap_is_shared_by_categories_not_podcast_record_types():
    cat = catalog_for(['audiobook'] * 12 + ['podcast_show'] * 8 + ['podcast_episode'] * 8 + ['book'] * 8 + ['video'] * 8)
    ranked = {x.item_id: 'Direct match.' for x in cat.items}
    interpretation = interpret_question('AI videos podcasts books and audiobooks')
    result = result_set(cat, profile(), interpretation, NOW, limits=LIVE_LIMITS, ranking=ranked)
    counts = {name: section['verified_count'] for name, section in result['sections'].items()}
    assert counts == {'videos': 6, 'podcasts': 6, 'books': 6, 'audiobooks': 6}
    assert len(result['results']) == 24


def test_sparse_category_is_not_filled_with_extra_items_from_another_category():
    cat = catalog_for(['audiobook'] * 20 + ['book'])
    result = result_set(cat, profile(), interpret_question('AI videos podcasts books audiobooks'), NOW,
                        limits=LIVE_LIMITS, ranking={x.item_id: 'Direct match.' for x in cat.items})
    assert len(result['results']) == 7
    assert result['sections']['videos']['insufficient_evidence']
    assert result['sections']['podcasts']['insufficient_evidence']


def test_single_category_retains_the_full_result_allowance():
    cat = catalog_for(['book'] * 20)
    result = result_set(cat, profile(), interpret_question('AI books'), NOW, limits=LIVE_LIMITS,
                        ranking={x.item_id: 'Direct match.' for x in cat.items})
    assert len(result['results']) == 20


def test_rank_input_balances_four_categories_instead_of_five_record_types():
    cat = catalog_for(['podcast_show'] * 40 + ['podcast_episode'] * 40 + ['book'] * 40 + ['video'] * 40 + ['audiobook'] * 40)
    seen = []

    def invoke(raw):
        candidates = json.loads(raw)['input']['candidates']
        seen.extend(candidates)
        return {'data': {'items': [{'item_id': candidates[0]['item_id'], 'reason': 'Direct match.', 'fit': 'direct'}]}}

    HermesProvider(invoke).rank('AI in all formats', cat, 10)
    counts = Counter('podcasts' if x['format'].startswith('podcast') else x['format'] for x in seen)
    assert len(seen) == 60 and set(counts.values()) == {15}
    assert {'podcast_show', 'podcast_episode'} <= {x['format'] for x in seen}


def test_partial_ranking_validation_is_reported_in_the_real_job(tmp_path):
    cat = one_book()
    def invoke(raw):
        if json.loads(raw)['stage'] == 'interpret':
            return {'data': {'topic': 'gardening', 'terms': ['gardening'], 'formats': ['book']}}
        return {'data': {'items': [{'item_id': 'invented', 'reason': 'Bad.', 'fit': 'direct'},
                                  {'item_id': 'ol:1', 'reason': 'Useful gardening book.', 'fit': 'direct'}]}}
    result = run_search(store_at(tmp_path), 'gardening books', catalog=cat, profile=profile(), now=NOW,
                        provider=HermesProvider(invoke), retriever=lambda *args: (cat, []),
                        limits=LIVE_LIMITS, disclosure_accepted=True)
    assert result['job']['state'] == 'partial'
    assert [x['item_id'] for x in result['results']] == ['ol:1']
    assert result['ranking']['invalid_entries'] == 1
    assert any(x['source_id'] == 'ranking' and x['state'] == 'partial' for x in result['sources'])


def test_small_uneven_global_limit_does_not_starve_an_available_category():
    from dataclasses import replace
    cat = catalog_for(['audiobook'] * 8 + ['podcast_show'] * 8 + ['book'] * 8 + ['video'] * 8)
    result = result_set(cat, profile(), interpret_question('AI videos podcasts books audiobooks'), NOW,
                        limits=replace(LIVE_LIMITS, max_hits=5),
                        ranking={x.item_id: 'Direct match.' for x in cat.items})
    assert len(result['results']) == 5
    assert all(s['verified_count'] >= 1 for s in result['sections'].values())
    assert all(s['verified_count'] <= 2 for s in result['sections'].values())
