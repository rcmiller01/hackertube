"""Run new regressions and before screenshots against the exact base, restoring byte-identically.
No git checkout: uncommitted implementation remains protected by finally restoration.
"""
from pathlib import Path
import subprocess
import hashlib
import json
ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = '1de0e625a8d31cb0e664bb4fbd7db49ce522586d'
FILES = ['hackertube/dashboard/dist/index.js','hackertube/dashboard/dist/style.css']
def run(args, filename):
    result = subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / filename).write_bytes(result.stdout)
    return result
saved = {name:(ROOT/name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT/name).write_bytes(subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT))
    result = run(['node','--test','--test-reporter=tap','--test-name-pattern','^visual ','tests/test_dashboard_page.js'],'red-base-visual.log')
    assert result.returncode != 0, 'new regressions must fail on base'
    # Parse exact TAP identifiers once; do not count the reporter's repeated failure summary.
    import re
    failed = re.findall(r'^not ok \d+ - (visual .+)$', result.stdout.decode(), re.MULTILINE)
    assert len(failed) == 21 and len(set(failed)) == 21, failed
    races = []
    for index in range(1, 6):
        race = run(['node','--test','--test-name-pattern','FEED12','tests/test_browser_requests.js'],f'red-FEED12-base-{index}.log')
        races.append({'run':index,'exit':race.returncode})
    (OUT/'red-FEED12-rate.json').write_text(json.dumps({'base':BASE,'runs':races},indent=2)+'\n')
    (OUT/'red-manifest.json').write_text(json.dumps({'base':BASE,'returncode':result.returncode,'failingSubtests':failed},indent=2)+'\n')
    capture = run(['node','docs/receipts/visual-pass/capture.js','before'],'before-capture.log')
    assert capture.returncode == 0, capture.stdout.decode()
finally:
    for name,data in saved.items():
        (ROOT/name).write_bytes(data)
        assert hashlib.sha256((ROOT/name).read_bytes()).digest() == hashlib.sha256(data).digest()
    print('Implementation restored byte-identically.')
