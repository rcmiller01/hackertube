"""Disposable enabled-plugin route probe: real Hermes storage, no live/paid dispatch.
The fresh home's provider is unconfigured; accept privacy before testing its refusal.
Never accesses plugin/model credentials. The successful path explicitly uses stub.
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

def mount(name):
    spec = importlib.util.spec_from_file_location(name, HOME/'plugins/hackertube/dashboard/plugin_api.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix='/api/plugins/hackertube')
    return TestClient(app)

client = mount('visual_clean_unconfigured')
from hackertube_core import outbound
policy = client.get('/api/plugins/hackertube/privacy').json()
accepted = client.post('/api/plugins/hackertube/privacy',json={'version':policy['version'],'accepted':True})
assert accepted.status_code == 200 and accepted.json()['accepted']
outbound.reset()
refused = client.post('/api/plugins/hackertube/search',json={'question':'What can I read by Jane Austen?','disclosure_accepted':True})
assert refused.status_code == 503, refused.text
assert outbound.counters() == {'free':0,'metered':0,'paid':0}, outbound.counters()
record = {'home':str(HOME),'storage':plugin_storage.__file__,'policy_accepted':True,'unconfigured_refusal':{'status':refused.status_code,'body':refused.json()},'refusal_counts':outbound.counters()}
save_plugin_setting('hackertube',('provider',),'stub')
client = mount('visual_clean_stub')
result = client.post('/api/plugins/hackertube/search',json={'question':'What can I read or listen to by Jane Austen?','disclosure_accepted':True})
assert result.status_code == 200, result.text
body = result.json()
assert body.get('provider') == 'stub', body
assert outbound.counters() == {'free':0,'metered':0,'paid':0}, outbound.counters()
record['stub'] = {'status':result.status_code,'provider':body['provider'],'state':body.get('job',{}).get('state'),'results':len(body.get('results',[])),'usage':body.get('usage'),'counts':outbound.counters()}
print(json.dumps(record,indent=2,sort_keys=True))
