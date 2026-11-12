"""Generate the review table from captured evidence, never hand-copy totals."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
s = json.loads((HERE / "summary.json").read_text())
m = json.loads((HERE / "mutations.json").read_text())
f = json.loads((HERE / "focused-checks.json").read_text())
lines = ["# Measured checks", "", "| Check | Result | Evidence |", "|---|---|---|"]
lines += [
    f"| pytest | {s['pytest']['collected']} collected; {s['pytest']['passed']} passed, {s['pytest']['failed']} failed | pytest-collect.log, pytest.log |",
    f"| Node | {s['node']['tests']} tests; {s['node']['pass']} passed, {s['node']['fail']} failed, {s['node']['skipped']} skipped | node-full-suite.log |",
    f"| FEED12 | {sum(r['exit']==0 for r in s['feed12'])}/{len(s['feed12'])} successful runs | feed12-*.log |",
    f"| mutations | {sum(r['caught'] for r in m['mutations'])}/{len(m['mutations'])} caught; restored green control exit {m['green_control']['exit']} | mutations.json, mutations.log, raw/ |",
    f"| validate / doctor | exit {s['plugin_validate_exit']} / {s['plugin_doctor_exit']} | plugin-validate.log, plugin-doctor.log |",
    "| path scanner | no matches in docs + openspec | path-scan.log; path-check.log |",
]
for row in f:
    lines.append(f"| {row['name']} | exit {row['exit']} (expected {row['expected']}); restored={row['restored']} | {row['name']}.log |")
lines += ["", "## Mutation diagnoses", "", "| Mutation | Exit | Caught | First failure |", "|---|---|---|---|"]
for row in m['mutations']:
    failure = row['failures'][0] if row['failures'] else "none"
    lines.append(f"| {row['name']} | {row['exit']} | {row['caught']} | {failure.replace('|', '/')} |")
(HERE / "summary-table.md").write_text("\n".join(lines) + "\n")
print("summary-table.md generated from summary.json, mutations.json, focused-checks.json")
