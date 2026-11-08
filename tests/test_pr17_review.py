"""Exact-head PR17 review: contradictory fit labels must fail closed."""

import json

import pytest

from hackertube_core.hermes import HermesProvider
from hackertube_core.search import LIVE_LIMITS, run_search
from test_results_tuning import catalog_for
from test_search import NOW, profile, store_at


@pytest.mark.parametrize('fits', [
    ('direct', 'uncertain'), ('uncertain', 'direct'),
    ('direct', 'related'), ('related', 'direct'),
])
def test_conflicting_fit_for_one_identity_cannot_override_uncertainty(fits):
    cat = catalog_for(['book', 'book'])
    rows = [{'item_id': 'media:0', 'reason': 'Model assessment.', 'fit': fit} for fit in fits]
    rows.append({'item_id': 'media:1', 'reason': 'Unambiguous direct match.', 'fit': 'direct'})
    provider = HermesProvider(lambda raw: {'data': {'items': rows}})
    ranked, _ = provider.rank('AI introductions', cat, 5)
    assert list(ranked) == ['media:1'], 'Do not promote an identity with contradictory fit labels'
    assert provider.ranking_diagnostics['invalid_entries'] == 2
    assert provider.ranking_diagnostics['conflicting_identities'] == 1
    assert provider.ranking_diagnostics['not_recommended'] == 0


@pytest.mark.parametrize('fit', ['direct', 'related', 'uncertain'])
def test_consistent_duplicate_fit_keeps_the_existing_deduplication_policy(fit):
    cat = catalog_for(['book'])
    row = {'item_id': 'media:0', 'reason': 'Consistent assessment.', 'fit': fit}
    provider = HermesProvider(lambda raw: {'data': {'items': [row, dict(row)]}})
    ranked, _ = provider.rank('AI introductions', cat, 5)
    assert list(ranked) == (['media:0'] if fit == 'direct' else [])
    assert provider.ranking_diagnostics['invalid_entries'] == 0


def test_conflicting_only_ranking_fails_closed_without_paid_retry(tmp_path):
    cat = catalog_for(['book'])
    calls = []

    def invoke(raw):
        stage = json.loads(raw)['stage']
        calls.append(stage)
        if stage == 'interpret':
            return {'data': {'topic': 'AI', 'terms': ['AI'], 'formats': ['book']}}
        return {'data': {'items': [
            {'item_id': 'media:0', 'reason': 'Clear fit.', 'fit': 'direct'},
            {'item_id': 'media:0', 'reason': 'Suitability unknown.', 'fit': 'uncertain'},
        ]}}

    result = run_search(store_at(tmp_path), 'AI books', catalog=cat, profile=profile(), now=NOW,
                        provider=HermesProvider(invoke), retriever=lambda *args: (cat, []),
                        limits=LIVE_LIMITS, disclosure_accepted=True)
    assert result['results'] == []
    assert result['job']['state'] == 'partial'
    assert result['ranking']['invalid_entries'] == 2
    assert calls == ['interpret', 'rank']
    assert result['usage']['request_counts']['paid'] == 2
