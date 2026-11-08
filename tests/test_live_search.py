"""Regressions from the November 8 review, before implementation fixes."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from hackertube_core import search
from hackertube_core.catalog import load_seed
from test_search import NOW, one_book, profile, store_at

ROOT = Path(__file__).resolve().parents[1]


def test_installable_directory_loads_catalog_without_repository(tmp_path):
    plugin = tmp_path / 'hackertube'
    shutil.copytree(ROOT / 'hackertube', plugin, ignore=shutil.ignore_patterns('__pycache__'))
    code = "import runpy; m=runpy.run_path(%r); assert len(m['load_catalog']().items)==12" % str(plugin / 'dashboard/catalog_view.py')
    result = subprocess.run([sys.executable, '-I', '-c', code], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_live_provider_decodes_chat_completion_and_sends_model():
    seen = {}
    def transport(key, endpoint, payload, **kwargs):
        seen.update(payload)
        return {'choices': [{'message': {'content': json.dumps({
            'topic': 'gardening', 'terms': ['gardening'], 'formats': ['book'],
            'depth': 'beginner', 'max_duration_seconds': None,
        })}}]}
    provider = search.LiveProvider('test-key', 'https://example.org/v1/chat/completions', model='test-model', transport=transport)
    result = provider.interpret('Help me grow vegetables', search.DEFAULT_LIMITS)
    assert seen['model'] == 'test-model'
    assert result.interpretation.topic == 'gardening'
    assert result.interpretation.formats == ('book',)


def test_live_provider_rejects_malformed_completion_instead_of_local_success():
    provider = search.LiveProvider('test-key', 'https://example.org/v1/chat/completions', transport=lambda *a, **k: {'choices': []})
    with pytest.raises(search.ProviderUnavailable):
        provider.interpret('gardening books', search.DEFAULT_LIMITS)


def test_format_filter_precedes_result_limit():
    result = search.result_set(load_seed(), profile(), search.interpret_question('Jane Austen books'), NOW, limits=search.Limits(max_hits=1))
    assert [row['format'] for row in result['results']] == ['book']
    assert result['sections']['books']['verified_count'] == 1


def test_live_transport_receives_remaining_deadline():
    seen = {}
    def transport(*args, **kwargs):
        seen.update(kwargs)
        return {'interpretation': {'topic': 'gardening', 'terms': ['gardening'], 'formats': ['book']}}
    search.LiveProvider('test-key', 'https://example.org', transport=transport).interpret('gardening books', search.Limits(deadline_seconds=2))
    assert 0 < seen['timeout'] <= 2


def test_search_uses_retrieved_catalog_instead_of_seed(tmp_path):
    retrieved = one_book()
    def retrieve(interpretation, now, budget):
        return retrieved, [{'source_id': 'openlibrary', 'state': 'succeeded', 'items': 1}]
    result = search.run_search(store_at(tmp_path), 'gardening books', catalog=load_seed(), profile=profile(), now=NOW,
                               provider=search.StubProvider(), retriever=retrieve, disclosure_accepted=True)
    assert [row['item_id'] for row in result['results']] == ['ol:1']
    assert result['sources'][0]['state'] == 'succeeded'
