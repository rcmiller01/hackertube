"""Generate the post-#42 receipt tables FROM the raw logs, never by hand.

    python3 docs/receipts/post42/summarize.py

Reads pytest.log, node-full-suite.log, feed12.log, mutations.json, gap-probe.log,
clean-profile.log and the two plugin CLI logs, and writes summary.json,
summary-table.md and mutation-table.md beside them. The receipt-path count is
re-counted from the files themselves rather than read from a claim about them.
"""
import json
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))
RECEIPTS = os.path.dirname(OUT)
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
    """The probe's structured report, from the JSON object at the end of its log."""
    text = read("gap-probe.log")
    start = text.rfind('{\n  "runs":')
    if start < 0:
        return None
    data = json.loads(text[start:])
    runs = []
    for run in data["runs"]:
        shipped, old = run["this_card_95"], run["previous_50"]
        runs.append(dict(
            label=run["label"], total=run["total"],
            shipped=dict(painted=shipped["painted"], partial=shipped["partial"],
                         fraction=shipped["paintedFraction"]),
            previous=dict(painted=old["painted"], partial=old["partial"],
                          fraction=old["paintedFraction"]),
        ))
    return dict(runs=runs)


def receipt_paths():
    files = 0
    offenders = []
    for dirpath, _, names in os.walk(RECEIPTS):
        for name in names:
            path = os.path.join(dirpath, name)
            files += 1
            data = open(path, "rb").read()
            # Named, not echoed: this summary is itself a file under
            # docs/receipts/, so writing the matched bytes here would put the
            # receipts in the state the check exists to detect.
            hits = {LABELS[token]: data.count(token) for token in FORBIDDEN if token in data}
            if hits:
                offenders.append(os.path.relpath(path, RECEIPTS) + " " + str(hits))
    return dict(files=files, offenders=offenders)


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


def main():
    summary = dict(
        pytest=pytest_counts(),
        node=node_counts(),
        feed12=feed12(),
        mutations=mutations(),
        gap_probe=gap_probe(),
        receipt_paths=receipt_paths(),
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
    if summary["receipt_paths"]:
        paths = summary["receipt_paths"]
        rows.append(f"| An absolute home path under `docs/receipts/` (`Users`/`home` prefix) | "
                    f"{len(paths['offenders'])} matches over {paths['files']} files"
                    f"{' — ' + '; '.join(paths['offenders'][:3]) if paths['offenders'] else ''} |")
    if summary["gap_probe"]:
        for run in summary["gap_probe"]["runs"]:
            shipped, old = run["shipped"], run["previous"]
            rows.append(f"| {run['label']} | this card: {shipped['painted']}/{run['total']} "
                        f"({100 * shipped['fraction']:.1f}%) painted, {shipped['partial']} partly painted "
                        f"-> {'PASSES' if shipped['painted'] == run['total'] else 'FAILS as coverage'}; "
                        f"the 50% band: {old['painted']}/{run['total']} ({100 * old['fraction']:.1f}%) "
                        f"-> {'PASSES' if old['painted'] == run['total'] else 'FAILS as coverage'} |")
    if summary["mutations"]:
        muts = summary["mutations"]["mutations"]
        rows.append(f"| Ring mutations caught by these tests (red) | "
                    f"{sum(1 for m in muts if m['caught'])}/{len(muts)} |")
        green = summary["mutations"]["green_control"]
        rows.append(f"| Green control after every revert | exit {green['exit']}, all three tests pass: "
                    f"{all(green['verdicts'].values())} |")
    if summary["clean_profile"]:
        outage = summary["clean_profile"]["outage"]
        rows.append(f"| Clean profile, source-down failure path | return with "
                    f"{outage['sources']} sources accounted, {outage['items']} items, "
                    f"outbound {outage['counts']} (down source: {outage['down_source']}) |")
    rows.append(f"| `hermes plugins validate .` | {summary['plugin_validate']} |")
    rows.append(f"| `hermes plugins doctor . --ci` | {summary['plugin_doctor']} |")
    with open(os.path.join(OUT, "summary-table.md"), "w") as handle:
        handle.write("\n".join(rows) + "\n")

    if summary["mutations"]:
        names = summary["mutations"]["test_names"]
        table = ["| Mutation | Files | Wanted | Caught | Full card | Compact row | Coverage control | First assertion |",
                 "|---|---|---|---|---|---|---|---|"]
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
                         f"{state(names[2])} | {first} |")
        with open(os.path.join(OUT, "mutation-table.md"), "w") as handle:
            handle.write("\n".join(table) + "\n")

    print(json.dumps({k: v for k, v in summary.items() if k != "mutations"}, indent=2)[:2500])


if __name__ == "__main__":
    main()
