import sys,json,tempfile,sqlite3,contextlib,time,traceback
from pathlib import Path
sys.path.insert(0,'<hermes-home>/hermes-agent')
import hermes_bootstrap
sys.path.insert(0,'<repo>/hackertube')
from hermes_cli.plugins import PluginContext, PluginManifest, get_plugin_manager
from hackertube_core.hermes import register,HermesProvider,web_search
from hackertube_core.retrieval import SourceRetriever
from hackertube_core.profile import ProfileStore,utc_now
from hackertube_core.catalog import load_seed
from hackertube_core.search import run_search,LIVE_LIMITS
from hackertube_core import outbound
# This is an ephemeral native registration in this probe process. No plugin
# is installed/enabled and no provider configuration is changed on disk.
ctx=PluginContext(PluginManifest(name='hackertube',path='<repo>/hackertube',source='user'),get_plugin_manager())
register(ctx)
try:
    import tools.web_tools  # normal host tool registration, probe setup only
except Exception:
    pass
scratch=Path(tempfile.mkdtemp(prefix='ht-live-results-'))
def connect():
    conn=sqlite3.connect(scratch/'profile.db');conn.row_factory=sqlite3.Row;return conn
store=ProfileStore(connect)
started=time.monotonic()
try:
    result=run_search(store,'Find beginner books about vegetable gardening',catalog=load_seed(),profile=store.snapshot(),now=utc_now(),provider=HermesProvider(),retriever=SourceRetriever(store,web_search=web_search),limits=LIVE_LIMITS,disclosure_accepted=True)
    frame={'state':result['job']['state'],'elapsed_seconds':round(time.monotonic()-started,3),'model_route':result['model_route'],'interpretation':result['interpretation'],'results':[{'item_id':x['item_id'],'title':x['title'],'destination':x['destination'],'why':x['why']} for x in result['results']],'sources':result['sources'],'usage':result['usage'],'scratch':str(scratch)}
except Exception as exc:
    # Exceptions can contain provider request objects. Report only the type.
    frame={'error_type':type(exc).__name__,'elapsed_seconds':round(time.monotonic()-started,3),'counts':outbound.counters()}
print('HACKERTUBE_RECEIPT='+json.dumps(frame))
