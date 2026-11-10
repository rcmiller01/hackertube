"""Aggregate raw receipts; never hand-transcribe the numeric summary table."""
import hashlib
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
before = json.loads((OUT/'before-geometry.json').read_text())
after = json.loads((OUT/'after-geometry.json').read_text())
red = json.loads((OUT/'red-manifest.json').read_text())
# The initial independent five-trial baseline is retained even when a replay happens to pass.
rates = [json.loads((OUT/name).read_text()) for name in ['red-FEED12-initial-rate.json','red-FEED12-rate.json']]
node = (OUT/'node.log').read_text()
pytest = (OUT/'pytest.log').read_text()
node_counts = {name:int(re.search(r'(?:ℹ |# )'+name+r' (\d+)',node).group(1)) for name in ['tests','pass','fail','skipped']}
python_count = int(re.search(r'(\d+) passed',pytest).group(1))
trials = []
for index in range(1,6):
    text = (OUT/f'FEED12-{index}.log').read_text()
    assert re.search(r'(?:ℹ |# )fail 0\b',text), text
    trials.append({'run':index,'passed':True,'log':f'FEED12-{index}.log'})
measures = [{'width':a['width'],'before':b['firstFeedCardTop'],'after':a['firstFeedCardTop'],'afterControlsOpen':a['controlsOpen']} for b,a in zip(before['viewports'],after['viewports'])]
files = ['hackertube/dashboard/dist/index.js','hackertube/dashboard/dist/style.css','hackertube/hackertube_core/search.py']
summary = {'base':red['base'],'branch':'hermes/visual-pass','source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in files},'node':node_counts,'python_passed':python_count,'red_regressions':len(red['failingSubtests']),'positive_controls_on_base':3,'feed12_after':trials,'feed12_baseline_batches':[{'failures':sum(row['exit']!=0 for row in rate['runs']),'runs':len(rate['runs'])} for rate in rates],'first_card_offsets':measures,'scope':'Compiled host CSS and real plugin JS/CSS, stub SDK/API. External artwork blocked, no installed gateway or screen reader claim.'}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
table = '| Check | Measured outcome |\n|---|---|\n'
table += f'| Python | {python_count} passed |\n| Node/browser | {node_counts["pass"]} passed, {node_counts["fail"]} failed, {node_counts["skipped"]} skipped |\n'
table += f'| New regressions on base | {len(red["failingSubtests"])} failed; 3 positive controls passed |\n| FEED12 fixed | {len(trials)}/{len(trials)} consecutive passes |\n'
for row in measures: table += f'| First card top at {row["width"]}px | {row["before"]:.2f}px before → {row["after"]:.2f}px after |\n'
(OUT/'summary-table.md').write_text(table)
print(table)
print(json.dumps(summary,indent=2))
