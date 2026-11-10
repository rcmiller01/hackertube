"""Validate immutable receipt prefixes and enumerate production chokepoints."""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = "d874ed20e6ef2fcb96778be1cc32b18d2bfdc7ce"
report = {"base": BASE, "historical_receipt_prefixes": {}, "sites": {}}
for name in ["red-mutations.log", "red-commit.log"]:
    path = "docs/receipts/design-followups/" + name
    original = subprocess.check_output(["git", "show", BASE + ":" + path], cwd=ROOT)
    assert (ROOT / path).read_bytes().startswith(original), path
    report["historical_receipt_prefixes"][path] = "byte-identical original prefix; annotation appended"
path = ROOT / "hackertube/dashboard/dist/index.js"
lines = path.read_text().splitlines()
for pattern in ["renderCard(","renderArt(","usesYouTubeBrandLink(","searchStatusLine(",
                "setFocusHeading(","hackertube-privacy-policy"]:
    hits = [{"line":i,"text":line.strip()} for i,line in enumerate(lines,1)
            if pattern in line and "function " + pattern not in line]
    report["sites"][pattern] = {"count":len(hits),"matches":hits}
base = subprocess.check_output(["git","show",BASE+":hackertube/dashboard/dist/index.js"],cwd=ROOT,text=True)
for literal in ["Feed updated from this search.","Open at source: "]:
    assert path.read_text().count(literal) == base.count(literal)
report["preserved_copy_literal_counts"] = True
receipt = Path(__file__).parent
node = (receipt / "node.log").read_text()
report["node_pass"] = int(re.findall(r"ℹ pass (\d+)",node)[0])
report["node_fail"] = int(re.findall(r"ℹ fail (\d+)",node)[0])
report["new_node_tests"] = report["node_pass"] - 110
assert report["node_fail"] == 0
report["red_logs"] = {}
for name in ["red-youtube.log","red-focus.log","red-hidden.log","red-status.log","red-youtube-clearspace.log"]:
    text = (receipt / name).read_text()
    count = int(re.findall(r"ℹ fail (\d+)",text)[0])
    assert count > 0 and "AssertionError" in text and "MODULE_NOT_FOUND" not in text
    report["red_logs"][name] = count
print(json.dumps(report,indent=2))
