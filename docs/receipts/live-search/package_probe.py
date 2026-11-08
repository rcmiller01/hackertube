import os,sys,json,tempfile,shutil,pathlib,subprocess
root=pathlib.Path('/Users/robert/Developer/hackertube')
home=pathlib.Path(tempfile.mkdtemp(prefix='ht-hermes-install-'))
shutil.copytree(root/'hackertube',home/'plugins/hackertube',ignore=shutil.ignore_patterns('__pycache__','.DS_Store'))
(home/'config.yaml').write_text('plugins:\n  enabled: [hackertube]\n')
code=r'''
import sys,json,importlib.util
sys.path.insert(0,'/Users/robert/.hermes/hermes-agent')
import hermes_bootstrap
from hermes_cli.plugins import get_plugin_auxiliary_tasks
from hermes_constants import get_hermes_home
home=get_hermes_home()
tasks=get_plugin_auxiliary_tasks()
p=home/'plugins/hackertube/dashboard/plugin_api.py'
spec=importlib.util.spec_from_file_location('ht_installed_routes',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from fastapi import FastAPI
from fastapi.testclient import TestClient
app=FastAPI();app.include_router(m.router)
client=TestClient(app)
print(json.dumps({'slot_registered':any(x['key']=='hackertube_search' for x in tasks),'provider':client.get('/status').json(),'search':{k:v for k,v in client.get('/search').json().items() if k in ['provider','provider_available','limits']},'catalog_count':len(client.get('/catalog').json()['catalog']['items'])}))
'''
env=dict(os.environ,HERMES_HOME=str(home))
p=subprocess.run(['/Users/robert/.hermes/tools/python-3.14.9+20261021-darwin-arm64/bin/python3','-I','-c',code],capture_output=True,text=True,env=env,timeout=50)
print(json.dumps({'home':str(home),'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr},indent=2))
