"""Generate the post-#37 numeric summary FROM the raw receipt files.

Every figure here is parsed out of the log files in this directory; nothing is
transcribed by hand. Run:  <venv>/bin/python docs/receipts/post37/summarize.py
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(name):
    path = HERE / name
    return path.read_text(encoding="utf-8") if path.exists() else ""


out = {}

collect = read("pytest-collect.log")
m = re.search(r"(\d+) tests collected", collect)
out["python_collected"] = int(m.group(1)) if m else None

pytest_log = read("pytest.log")
m = re.search(r"(\d+) passed", pytest_log)
out["python_passed"] = int(m.group(1)) if m else None
m = re.search(r"(\d+) failed", pytest_log)
out["python_failed"] = int(m.group(1)) if m else None

node = read("node.log")
out["node"] = {k: int(v) for k, v in re.findall(r"ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)", node)}

feed = read("feed12.log")
m = re.search(r"FEED12 pass_runs=(\d+)/(\d+)", feed)
out["feed12"] = {"pass": int(m.group(1)), "runs": int(m.group(2))} if m else None

contrast = []
for line in read("item4-contrast-measured.log").splitlines():
    m = re.match(r"MEASURED_CONTRAST at (\d+)px ring=(\[[^\]]*\]) surface=(\{.*?\}) contrast=(\{.*\})", line)
    if m:
        contrast.append({"width": int(m.group(1)), "ring": json.loads(m.group(2)),
                         "surface": json.loads(m.group(3)), "contrast": json.loads(m.group(4))})
out["ring_contrast_per_viewport"] = contrast
if contrast:
    vals = [v for c in contrast for v in c["contrast"].values()]
    out["ring_contrast_min"] = min(vals)
    out["ring_contrast_max"] = max(vals)

for name, key in [("item1-probe-red-original.log", "item1_probe_original_exit"),
                  ("item1-probe-green-leak.log", "item1_probe_fixed_leak_exit"),
                  ("item1-probe-restored-green.log", "item1_probe_clean_exit"),
                  ("item3-restored-green.log", "item3_restored_green_exit"),
                  ("item4-restored-green.log", "item4_restored_green_exit"),
                  ("item2-restored-green.log", "item2_restored_green_exit")]:
    m = re.search(r"exit_code=(\d+)", read(name))
    out[key] = int(m.group(1)) if m else None

out["mutations_red_fail_counts"] = {
    "item3_absent_guard": len(re.findall(r"FAILED", read("item3-red-absent-guard.log"))),
    "item3_wrong_message": len(re.findall(r"FAILED", read("item3-red-wrong-message.log"))),
    "item2_no_tab": 1 if "AssertionError" in read("item2-red-no-tab.log") else 0,
    "item4_ring_surface_color": 1 if "contrast against the rendered surface" in read("item4-red-ring-surface-color.log") else 0,
}

print(json.dumps(out, indent=2))
(HERE / "summary.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
