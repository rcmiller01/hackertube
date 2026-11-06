"""Check that the coverage checker accepts valid mappings and rejects invalid ones."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
script = root / 'scripts/check_spec_coverage.py'

cases = {}

def case(name):
    def wrap(function):
        cases[name] = function
        return function
    return wrap

@case('missing-prd')
def _(root, trace):
    prd = root / 'docs/PRD.md'
    prd.write_text(prd.read_text().replace('| R32 |', '| R32-removed |'))

@case('dangling-scenario')
def _(root, trace):
    trace['R01']['scenarios'][0] = 'dashboard-shell/UI99'

@case('deferred-p0')
def _(root, trace):
    trace['R01'] = {'status': 'deferred', 'reason': 'Invalid P0 deferral.', 'scenarios': []}

@case('missing-post-demo')
def _(root, trace):
    del trace['R04']['post_demo_scenarios']

@case('non-p0-post-demo')
def _(root, trace):
    trace['R16']['status'] = 'demo'
    trace['R16']['scenarios'] = ['discovery-feed/FEED01']
    trace['R16']['post_demo_scenarios'] = ['discovery-feed/FEED01']
    trace['R16']['reason'] = 'Invalid P1 post-demo row.'

@case('unmapped-scenario')
def _(root, trace):
    trace['R01']['scenarios'].remove('dashboard-shell/UI01')

@case('subset-whole-row')
def _(root, trace):
    trace['R04']['status'] = 'post-demo'

@case('demo-defers-all')
def _(root, trace):
    trace['R13']['status'] = 'demo'

@case('duplicate-post-demo')
def _(root, trace):
    trace['R03']['post_demo_scenarios'].append('discovery-feed/FEED08')

@case('outside-row-subset')
def _(root, trace):
    trace['R03']['post_demo_scenarios'].append('focused-search/SEARCH06')

@case('missing-post-demo-reason')
def _(root, trace):
    del trace['R04']['reason']

@case('invalid-post-demo-subset-type')
def _(root, trace):
    trace['R04']['post_demo_scenarios'] = 'focused-search/SEARCH06'

@case('stale-status-value')
def _(root, trace):
    trace['R04']['status'] = 'specified'

@case('reason-without-post-demo')
def _(root, trace):
    trace['R01']['reason'] = 'Unexpected reason for a demo-only row.'

def expand_ids(prefix, start, end):
    return {f'{prefix}{number:02d}' for number in range(start, end + 1)}

expected_post_demo = {
    'focused-search/SEARCH02', 'focused-search/SEARCH06',
    'focused-search/SEARCH10', 'focused-search/SEARCH11',
    'focused-search/SEARCH12', 'hackathon-submission/HCKT19',
    'hackathon-submission/HCKT20', 'personal-library/LIB07',
    'personal-library/LIB08', 'personal-library/LIB09',
    'personalization-sources/PREF06', 'personalization-sources/PREF07',
    'personalization-sources/PREF13', 'discovery-feed/FEED08',
}
expected_post_demo.update(
    f'personal-library/LIB{number:02d}' for number in range(4, 7))
expected_post_demo.update(
    f'request-jobs/JOB{number:02d}' for number in range(5, 9))

expected_by_row = {}
for requirement, entry in json.loads(
        (root / 'openspec/changes/hackertube-v1/traceability.json').read_text()).items():
    expected_by_row[requirement] = set(entry.get('post_demo_scenarios', []))
actual_post_demo = set().union(*expected_by_row.values())
assert actual_post_demo == expected_post_demo
for requirement, entry in json.loads(
        (root / 'openspec/changes/hackertube-v1/traceability.json').read_text()).items():
    if requirement != 'R16':
        assert entry['status'] in {'demo', 'post-demo'}
        if entry['status'] == 'demo':
            assert set(entry['post_demo_scenarios']) != set(entry['scenarios'])
        else:
            assert set(entry['post_demo_scenarios']) == set(entry['scenarios'])

verification = (root / 'openspec/changes/hackertube-v1/verification.md').read_text()
rationale = verification.split('### Demo-cut review decisions', 1)[1].split(
    '## Delivery subset consistency', 1)[0]
for reference in sorted(expected_post_demo):
    short_id = reference.rsplit('/', 1)[1]
    line = next(line for line in rationale.splitlines()
                if line.startswith(f'- `{short_id}` '))
    assert 'post-demo' in line
print('PASS: 21 expected post-demo scenarios; every owning row, status, and rationale agrees')

results = []
for name, function in cases.items():
    with tempfile.TemporaryDirectory(prefix='hackertube-coverage-') as directory:
        fixture = Path(directory) / 'repo'
        shutil.copytree(root, fixture, ignore=shutil.ignore_patterns('.git', '__pycache__'))
        trace_path = fixture / 'openspec/changes/hackertube-v1/traceability.json'
        trace = json.loads(trace_path.read_text())
        function(fixture, trace)
        trace_path.write_text(json.dumps(trace, indent=2) + '\n')
        process = subprocess.run(
            ['python3', str(script), '--root', str(fixture)],
            capture_output=True, text=True, check=False)
        if process.returncode != 1:
            raise SystemExit(f'{name}: expected exit 1, got {process.returncode}: {process.stdout}{process.stderr}')
        message = (process.stderr or process.stdout).strip()
        results.append(f'{name}: exit {process.returncode}; {message}')
        print(results[-1])
print(f'PASS: {len(results)} invalid fixtures rejected')

# A mixed row is the required positive case: SEARCH01 remains demo work while
# only the listed refinement, agent, and evaluation scenarios wait.
process = subprocess.run(['python3', str(script), '--root', str(root)],
                         capture_output=True, text=True, check=False)
if process.returncode != 0:
    raise SystemExit(f'positive-mixed-row: expected exit 0: {process.stdout}{process.stderr}')
r04 = json.loads((root / 'openspec/changes/hackertube-v1/traceability.json').read_text())['R04']
expected = {
    'focused-search/SEARCH02', 'focused-search/SEARCH06',
    'focused-search/SEARCH12', 'hackathon-submission/HCKT20'}
if r04['status'] != 'demo' or set(r04['post_demo_scenarios']) != expected:
    raise SystemExit('positive-mixed-row: R04 status or subset is incorrect')
print("positive-mixed-row: exit 0; R04 keeps SEARCH01/03/04/05/07/08/09 in the demo; exactly SEARCH02/06/12 and HCKT20 are post-demo")
print('PASS: 1 mixed-row fixture accepted')
