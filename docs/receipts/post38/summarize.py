"""Regenerate `summary.json` and `summary-table.md` from the raw logs beside it.

Nothing here is hand-written: every number in the summary is parsed out of a log
in this directory. Run it after re-running any of the raw artefacts:

    <repo>/docs/receipts/post38$ <venv>/bin/python summarize.py
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(name):
    path = HERE / name
    return path.read_text(encoding="utf-8") if path.exists() else ""


out = {}

# --- pytest -----------------------------------------------------------------
pytest_log = read("pytest.log")
m = re.search(r"(\d+) passed", pytest_log)
out["pytest_passed"] = int(m.group(1)) if m else None
m = re.search(r"(\d+) failed", pytest_log)
out["pytest_failed"] = int(m.group(1)) if m else 0

# --- node full suite (three clean runs) -------------------------------------
runs = re.findall(r"tests (\d+)\n\u2139 pass (\d+)\n\u2139 fail (\d+)", read("node-full-suite.log"))
out["node_full_suite_runs"] = [{"tests": int(a), "pass": int(b), "fail": int(c)} for a, b, c in runs]

# --- the run where the unrelated PREF16 flake appeared ----------------------
flake = read("node-flake-run.log")
m_t = re.search(r"\u2139 tests (\d+)", flake)
m_p = re.search(r"\u2139 pass (\d+)", flake)
m_f = re.search(r"\u2139 fail (\d+)", flake)
out["node_flake_run"] = ({"tests": int(m_t.group(1)), "pass": int(m_p.group(1)), "fail": int(m_f.group(1))}
                         if m_t and m_p and m_f else None)
out["node_flake_test"] = "PREF16 interest remove button works by keyboard and stays removed after reload" if "\u2716 PREF16" in flake else None
out["node_flake_file"] = "tests/test_browser_requests.js" if "tests/test_browser_requests.js:116" in flake else None

# --- FEED12 -----------------------------------------------------------------
feed = read("feed12.log")
out["feed12_runs"] = len(re.findall(r"FEED12 run \d+", feed))
out["feed12_passed"] = len(re.findall(r"\u2139 pass 1\n\u2139 fail 0", feed))

# --- plugin checks ----------------------------------------------------------
out["plugin_validate_exit_0"] = "Validation passed." in read("plugin-validate.log")
out["plugin_doctor_exit_0"] = "OK: runtime discovery, manifest parsing, import, and registration passed" in read("plugin-doctor.log")
out["plugin_validate_warnings"] = [line.strip() for line in read("plugin-validate.log").splitlines() if line.strip().startswith(("\u2716", "!"))]

# --- mutation matrix --------------------------------------------------------
mutations = []
for line in read("mutations.log").splitlines():
    m = re.match(r"(\S.*?)\s+new=(red|green)\s+want=(red|green)\s+green-after-revert=(pass|FAIL)(?:\s+old-check=(.*?))?\s+(OK|NOT OK)$", line.strip())
    if m:
        mutations.append({
            "mutation": m.group(1).strip(), "new": m.group(2), "want": m.group(3),
            "green_after_revert": m.group(4),
            "old_check": (m.group(5) or "").strip() or None,
            "verdict": m.group(6),
        })
out["mutations"] = mutations
out["mutations_all_ok"] = "ALL OK" in read("mutations.log")

# --- the measured ratio each mutation produced (from the assertion messages) -
measured = {}
current = None
for line in read("mutations.log").splitlines():
    header = re.match(r"=== MUTATION: (.*?) in ", line)
    if header:
        current = header.group(1).strip()
        continue
    if not current or current in measured:
        continue
    hit = re.search(r"the painted focus ring reaches >= 3:1 on the (\w+) \(measured ([\d.]+):1, ring rgb\(([\d,]+)\) on surface rgb\(([\d,]+)\)", line)
    if hit:
        measured[current] = {"side": hit.group(1), "ratio": float(hit.group(2)),
                             "ring": hit.group(3), "surface": hit.group(4)}
        continue
    hit = re.search(r"the focus ring is painted around the link at all \((\d+)/(\d+) centreline pixels\)", line)
    if hit:
        measured[current] = {"ratio": 1.0, "painted": "%s/%s" % (hit.group(1), hit.group(2))}
out["measured_mutation_ratios"] = measured

# --- the compact clip the check reports (from the green runs) ----------------
clip = sorted(set(re.findall(r"REPORT at (\d+)px the compact row's Watch link (\w+): the ring is clipped by ([\w, ]+) \(0/\d+ painted\)", read("mutations.log"))))
out["compact_clipped_sides"] = [{"width": int(w), "side": s, "clippers": c} for w, s, c in clip]

# --- clean profile ----------------------------------------------------------
probe = HERE / "clean-profile" / "probe.json"
if probe.exists():
    data = json.loads(probe.read_text(encoding="utf-8"))
    out["clean_profile"] = {
        "home": data.get("home"),
        "installed_ring_rule": data.get("installed_ring_rule"),
        "source_outage": data.get("source_outage"),
    }

(HERE / "summary.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")

# --- the markdown table, generated from `out` -------------------------------
rows = [
    ("Python (pytest -q)", "%s passed / %s failed" % (out["pytest_passed"], out["pytest_failed"])),
    ("Node full suite (3 runs)", ", ".join("%d/%d/%d" % (r["tests"], r["pass"], r["fail"]) for r in out["node_full_suite_runs"])),
    ("FEED12 (10 runs)", "%s/%s" % (out["feed12_passed"], out["feed12_runs"])),
]
if out["node_flake_run"]:
    rows.append(("Node suite, the run with the unrelated flake",
                 "%d/%d/%d (%s in %s)" % (out["node_flake_run"]["tests"], out["node_flake_run"]["pass"],
                                          out["node_flake_run"]["fail"], out["node_flake_test"], out["node_flake_file"])))
rows += [
    ("Mutations, all as expected", "yes" if out["mutations_all_ok"] else "NO"),
    ("Mutations the OLD check missed", ", ".join(m["mutation"] for m in mutations if m["old_check"] == "GREEN -> MISSED") or "none"),
    ("`hermes plugins validate .`", "exit 0" if out["plugin_validate_exit_0"] else "see log"),
    ("`hermes plugins doctor . --ci`", "exit 0" if out["plugin_doctor_exit_0"] else "see log"),
]
if out.get("clean_profile"):
    outage = out["clean_profile"]["source_outage"] or {}
    rows.append(("Clean-profile source-down pass",
                 "sources %s, items %s, ledger %s (down: %s)" % (
                     outage.get("sources"), outage.get("items"), outage.get("counts"), outage.get("down_source"))))
lines = ["| Check | Result |", "|---|---|"] + ["| %s | %s |" % row for row in rows]
(HERE / "summary-table.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

# --- the mutation table, also generated from `out` --------------------------
mut_rows = []
for m in mutations:
    got = measured.get(m["mutation"], {})
    if "ratio" in got and "painted" in got:
        measured_text = "painted %s (ratio 1:1)" % got["painted"]
    elif "ratio" in got:
        measured_text = "%.2f:1 (%s, ring rgb(%s) on surface rgb(%s))" % (
            got["ratio"], got["side"], got["ring"], got["surface"])
    else:
        measured_text = "n/a"
    mut_rows.append("| %s | %s | %s | %s | %s | %s |" % (
        m["mutation"], m["want"], m["new"], m["green_after_revert"],
        m["old_check"] or "not run", measured_text))
mut_lines = ["| Mutation | Wanted | New check | Green after revert | Old check (base test file) | Measured |",
             "|---|---|---|---|---|---|"] + mut_rows
(HERE / "mutation-table.md").write_text("\n".join(mut_lines) + "\n", encoding="utf-8")
print(json.dumps(out, indent=2))
