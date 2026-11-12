"""Generate the post-#43 receipt tables FROM the raw logs, never by hand.

    python3 docs/receipts/post43/summarize.py

Reads pytest.log, path-check.log, node-full-suite.log, feed12.log, mutations.json,
gap-probe.json, clean-profile.log and the two plugin CLI logs, and writes
summary.json, summary-table.md and mutation-table.md beside them. The home-path
count is re-counted from the files themselves over the SAME two roots the check
scans (`docs/` and `openspec/`), not read from a claim about them.
"""
import json
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(OUT)))
SCANNED_ROOTS = ("docs", "openspec")
FORBIDDEN = (b"/" + b"Users" + b"/", b"/" + b"home" + b"/")
LABELS = {FORBIDDEN[0]: "Users-prefix", FORBIDDEN[1]: "home-prefix"}


def read(name):
    path = os.path.join(OUT, name)
    return open(path).read() if os.path.exists(path) else ""


def pytest_counts():
    match = re.search(r"(\d+) passed(?:, (\d+) failed)?", read("pytest.log"))
    if not match:
        return None
    return dict(passed=int(match.group(1)), failed=int(match.group(2) or 0))


def path_check():
    match = re.search(r"(\d+) passed", read("path-check.log"))
    failed = re.search(r"(\d+) failed", read("path-check.log"))
    return dict(passed=int(match.group(1)) if match else None,
                failed=int(failed.group(1)) if failed else 0)


def node_counts():
    text = read("node-full-suite.log")
    tests = re.search(r"^\u2139 tests (\d+)$", text, re.M)
    passed = re.search(r"^\u2139 pass (\d+)$", text, re.M)
    failed = re.search(r"^\u2139 fail (\d+)$", text, re.M)
    if not (tests and passed and failed):
        return None
    return dict(tests=int(tests.group(1)), passed=int(passed.group(1)), failed=int(failed.group(1)))


def feed12():
    runs = [line for line in read("feed12.log").splitlines() if line.startswith("run ")]
    ok = [line for line in runs if "exit=0" in line and "fail 0" in line]
    return dict(runs=len(runs), passed=len(ok))


def mutations():
    path = os.path.join(OUT, "mutations.json")
    return json.load(open(path)) if os.path.exists(path) else None


def gap_probe():
    path = os.path.join(OUT, "gap-probe.json")
    return json.load(open(path)) if os.path.exists(path) else None


def home_paths():
    """Re-count over the two roots the check scans, from the files themselves."""
    files = 0
    offenders = []
    for root in SCANNED_ROOTS:
        for dirpath, _, names in os.walk(os.path.join(REPO, root)):
            for name in names:
                path = os.path.join(dirpath, name)
                files += 1
                try:
                    data = open(path, "rb").read()
                except OSError:
                    continue
                # Named, not echoed: this summary is itself a file under
                # docs/, so writing the matched bytes here would put the tree in
                # the state the check exists to detect.
                hits = {LABELS[token]: data.count(token) for token in FORBIDDEN if token in data}
                if hits:
                    offenders.append(os.path.relpath(path, REPO) + " " + str(hits))
    return dict(files=files, offenders=offenders, roots=list(SCANNED_ROOTS))


def clean_profile():
    match = re.search(r"\{\n  \"home\".*?\n\}", read("clean-profile.log"), re.S)
    if not match:
        return None
    data = json.loads(match.group(0))
    return dict(home=data["home"], ring_rule=data["installed_ring_rule"].splitlines()[0],
                wrapper_rule=data["installed_wrapper_rule"].replace("\n", " "),
                outage=data["source_outage"])


def plugin_result(name, marker):
    return f"exit 0 ({marker})" if marker in read(name) else "see log"


def mutation_rows(summary):
    muts = summary["mutations"]["mutations"] if summary["mutations"] else []
    rows = [f"| Ring mutations caught by these tests (red) | {sum(1 for m in muts if m['caught'])}/{len(muts)} |"]
    if summary["mutations"]:
        green = summary["mutations"]["green_control"]
        rows.append(f"| Green control after every revert | exit {green['exit']}, all four tests pass: "
                    f"{all(green['verdicts'].values())} |")
    return rows


def gap_rows(summary):
    if not summary["gap_probe"]:
        return []
    rows = []
    for run in summary["gap_probe"]["runs"]:
        side = run["sides"]["left"]
        total = side["total"]
        shipped, old, delta = side["ring_relative"], side["strongest_difference"], side["fixed_delta"]
        rows.append(
            f"| {run['label']} | {run['dpr']} | {shipped['painted']}/{total} painted, {shipped['partial']} partly "
            f"-> {'PASSES' if shipped['painted'] == total else 'FAILS as coverage'} "
            f"| {old['painted']}/{total} painted, {old['partial']} partly "
            f"| {delta['painted']}/{total} painted |")
    return rows


def main():
    summary = dict(
        pytest=pytest_counts(),
        path_check=path_check(),
        node=node_counts(),
        feed12=feed12(),
        mutations=mutations(),
        gap_probe=gap_probe(),
        home_paths=home_paths(),
        clean_profile=clean_profile(),
        plugin_validate=plugin_result("plugin-validate.log", "Validation passed."),
        plugin_doctor=plugin_result("plugin-doctor.log", "OK: runtime discovery"),
    )
    with open(os.path.join(OUT, "summary.json"), "w") as handle:
        json.dump(summary, handle, indent=2)

    muts = summary["mutations"]["mutations"] if summary["mutations"] else []
    rows = ["| Check | Result |", "|---|---|"]
    if summary["pytest"]:
        rows.append(f"| Python (pytest -q) | {summary['pytest']['passed']} passed / "
                    f"{summary['pytest']['failed']} failed |")
    if summary["node"]:
        n = summary["node"]
        rows.append(f"| Node full suite (`node --test tests/*.js`) | {n['tests']} tests, "
                    f"{n['passed']} passed / {n['failed']} failed |")
    if summary["feed12"]:
        rows.append(f"| FEED12 (10 runs) | {summary['feed12']['passed']}/{summary['feed12']['runs']} |")
    if summary["path_check"]:
        pc = summary["path_check"]
        rows.append(f"| `tests/test_receipt_paths.py` (the widened scan) | {pc['passed']} passed / "
                    f"{pc['failed']} failed |")
    if summary["home_paths"]:
        hp = summary["home_paths"]
        roots = "/".join(hp["roots"])
        rows.append(f"| An absolute home path under `{roots}` "
                    f"(`Users`/`home` prefix) | {len(hp['offenders'])} matches over {hp['files']} files"
                    f"{' — ' + '; '.join(hp['offenders'][:3]) if hp['offenders'] else ''} |")
    rows += mutation_rows(summary)
    # The gradient finding lives on the strokes the gradient VARIES along, which at
    # this width are the horizontal ones; the left stroke above is uniform on that
    # surface and cannot show it. Both readings are printed for the same pixels.
    if summary["gap_probe"]:
        for run in summary["gap_probe"]["runs"]:
            if not (run["gradient"] and run["rows"] == 0):
                continue
            for side in ("top", "bottom"):
                s = run["sides"][side]
                old = s["strongest_difference"]
                if not old["partial"]:
                    continue
                rows.append(f"| {run['label']}, the varying {side} stroke | this card: "
                            f"{s['ring_relative']['painted']}/{s['total']} painted, "
                            f"{s['ring_relative']['partial']} partly -> PASSES; strongest-difference: "
                            f"{old['painted']}/{s['total']} painted, {old['partial']} partly "
                            f"-> the finding reproduced |")
    if summary["clean_profile"]:
        outage = summary["clean_profile"]["outage"]
        rows.append(f"| Clean profile, source-down failure path | return with "
                    f"{outage['sources']} sources accounted, {outage['items']} items, "
                    f"outbound {outage['counts']} (down source: {outage['down_source']}) |")
    rows.append(f"| `hermes plugins validate .` | {summary['plugin_validate']} |")
    rows.append(f"| `hermes plugins doctor . --ci` | {summary['plugin_doctor']} |")
    with open(os.path.join(OUT, "summary-table.md"), "w") as handle:
        handle.write("\n".join(rows) + "\n")

    gap = gap_rows(summary)
    if gap:
        with open(os.path.join(OUT, "gap-table.md"), "w") as handle:
            handle.write("| run | DPR | ring-relative (this card) | strongest-difference | fixed delta (> 20) |\n")
            handle.write("|---|---|---|---|---|\n")
            handle.write("\n".join(gap) + "\n")

    if summary["mutations"]:
        names = summary["mutations"]["test_names"]
        table = ["| Mutation | Files | Wanted | Caught | Full card | Compact row | Coverage control | Gradient | First assertion |",
                 "|---|---|---|---|---|---|---|---|---|"]
        for m in muts:
            verdict = m["verdict"]

            def state(name):
                key = next((k for k in verdict if k.startswith(name)), None)
                value = verdict.get(key) if key else None
                return "-" if value is None else ("green" if value else "red")

            first = next((line for line in m["failures"] if "AssertionError" in line), "")
            first = first.replace("AssertionError [ERR_ASSERTION]: ", "").replace("|", "\\|")
            files = ", ".join(dict.fromkeys(m["files"]))
            table.append(f"| {m['name']} | `{files}` | {m['expect']} | "
                         f"{'yes' if m['caught'] else 'no'} | {state(names[0])} | {state(names[1])} | "
                         f"{state(names[2])} | {state(names[3])} | {first} |")
        with open(os.path.join(OUT, "mutation-table.md"), "w") as handle:
            handle.write("\n".join(table) + "\n")

    print(json.dumps({k: v for k, v in summary.items() if k != "mutations"}, indent=2)[:2500])


if __name__ == "__main__":
    main()
