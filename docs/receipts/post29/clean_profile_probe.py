"""Post-#29 clean-profile probe: a fresh enabled HackerTube profile.

Covers this card's change (the shipped note/CSS bytes), one provider failure
path, one source-outage path, and the explicit offline provider. Real Hermes
plugin storage/config; no live, paid or metered dispatch and no model key read.
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

HOME = Path(os.environ['HERMES_HOME'])
sys.path.insert(0, '/Users/robert/.hermes/hermes-agent')
from fastapi import FastAPI
from fastapi.testclient import TestClient
from plugins import plugin_storage
from hermes_cli.plugins_state import save_plugin_setting

record: dict = {'home': str(HOME), 'storage': plugin_storage.__file__}

# 1. The enabled plugin's own assets in this clean profile carry the change.
dist = HOME / 'plugins' / 'hackertube' / 'dashboard' / 'dist'
js = (dist / 'index.js').read_text(encoding='utf-8')
css = (dist / 'style.css').read_text(encoding='utf-8')
NOTE = 'Metadata from YouTube. Explanations and library actions are HackerTube\u2019s.'
assert NOTE in js, 'swapped note missing from the enabled profile'
assert 'not from YouTube.' not in js, 'old note still shipped'
assert '.hackertube .ht-compact .ht-format { display: none; }' in css, 'compact badge rule missing'
assert '.hackertube .ht-model-picker a {\n  min-height: 44px;' in css, 'link target rule missing'
assert 'min-height: 44px;' in css.split('.hackertube .ht-model-picker select {')[1].split('}')[0], 'select target rule missing'
record['assets'] = {'note': True, 'compact_badge_rule': True, 'tap_target_rules': True}


def mount(name):
    spec = importlib.util.spec_from_file_location(name, HOME / 'plugins/hackertube/dashboard/plugin_api.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix='/api/plugins/hackertube')
    return TestClient(app)


client = mount('post29_clean')

from hackertube_core import outbound

policy = client.get('/api/plugins/hackertube/privacy').json()
accepted = client.post('/api/plugins/hackertube/privacy', json={'version': policy['version'], 'accepted': True})
assert accepted.status_code == 200 and accepted.json()['accepted']
record['policy_accepted'] = True

status = client.get('/api/plugins/hackertube/status')
assert status.status_code == 200, status.text
record['status'] = {'status_code': status.status_code, 'body': status.json()}

# 2. Failure path: the fresh profile has no provider configured.
outbound.reset()
refused = client.post('/api/plugins/hackertube/search', json={'question': 'What can I read by Jane Austen?', 'disclosure_accepted': True})
assert refused.status_code == 503, refused.text
assert outbound.counters() == {'free': 0, 'metered': 0, 'paid': 0}, outbound.counters()
record['unconfigured_refusal'] = {'status': refused.status_code, 'body': refused.json(), 'counts': outbound.counters()}

# 3. Failure path: one source is down; the pass still returns and the healthy
#    source succeeds. Fetchers are injected so no network read happens.
from hackertube_core.adapters.base import ParseResult
from hackertube_core.profile import ProfileStore, open_profile_db
from hackertube_core.sources import REGISTRY, ingest


def source_down(query, now):
    raise OSError('connection refused')


def source_up(query, now):
    return ParseResult((), (), (), ())


store = ProfileStore(open_profile_db)
registry = {'openlibrary': REGISTRY['openlibrary'], 'hn': REGISTRY['hn']}
report = ingest(
    store, '2026-11-10T12:00:00Z', 'jane austen',
    fetchers={'openlibrary': source_down, 'hn': source_up}, registry=registry,
)
statuses = store.source_statuses()
assert statuses['openlibrary']['last_error'], statuses
assert statuses['hn']['last_error'] is None, statuses
assert list(report['items']) == [], report['items']
assert outbound.counters() == {'free': 0, 'metered': 0, 'paid': 0}, outbound.counters()
record['source_outage'] = {
    'openlibrary_last_error': statuses['openlibrary']['last_error'],
    'hn_last_error': statuses['hn']['last_error'],
    'sources': report['sources'],
    'counts': outbound.counters(),
}

# 4. The explicit offline provider still succeeds with no outbound call.
save_plugin_setting('hackertube', ('provider',), 'stub')
client = mount('post29_clean_stub')
result = client.post('/api/plugins/hackertube/search', json={'question': 'What can I read or listen to by Jane Austen?', 'disclosure_accepted': True})
assert result.status_code == 200, result.text
body = result.json()
assert body.get('provider') == 'stub', body
assert outbound.counters() == {'free': 0, 'metered': 0, 'paid': 0}, outbound.counters()
record['stub'] = {'status': result.status_code, 'provider': body['provider'], 'state': body.get('job', {}).get('state'), 'results': len(body.get('results', [])), 'usage': body.get('usage'), 'counts': outbound.counters()}

print(json.dumps(record, indent=2, sort_keys=True))
