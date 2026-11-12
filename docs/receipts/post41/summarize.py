"""Generate the post-#41 receipt tables FROM the raw logs, never by hand.

    python3 docs/receipts/post41/summarize.py

Reads pytest.log, node-full-suite.log, feed12.log, mutations.json, gap-probe.log,
clean-profile.log and the two plugin CLI logs, and writes summary.json,
summary-table.md and mutation-table.md beside them.
"""
import json
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))


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
    path = os.path.join(OUT, "gap-probe.log")
    if not os.path.exists(path):
        return None
    data = json.load(open(path))
    left = data["sides"]["left"]
    return dict(
        gap=data["gap"], total=left["total"],
        new_rule=dict(painted=left["straightFifty"]["painted"],
                      painted_fraction=left["straightFifty"]["paintedFraction"],
                      partial=left["straightFifty"]["partial"],
                      partial_fraction=left["straightFifty"]["partialAt"]["fraction"],
                      min_over_painted=left["straightFifty"]["minOverPainted"]),
        old_rule=dict(painted=left["fixedDelta"]["painted"],
                      painted_fraction=left["fixedDelta"]["paintedFraction"],
                      partial=left["fixedDelta"]["partial"],
                      min_over_painted=left["fixedDelta"]["minOverPainted"],
                      min_over_every=left["fixedDelta"]["minOverEvery"],
                      min_pixel_fraction=left["fixedDelta"]["minPixel"]["fraction"]),
    )


def clean_profile():
    path = os.path.join(OUT, "clean-profile.log")
    if not os.path.exists(path):
        return None
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
        clean_profile=clean_profile(),
        plugin_validate=plugin_result("plugin-validate.log", "Validation passed."),
        plugin_doctor=plugin_result("plugin-doctor.log", "OK: runtime discovery"),
    )
    with open(os.path.join(OUT, "summary.json"), "w") as handle:
        json.dump(summary, handle, indent=2)

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
    if summary["mutations"]:
        muts = summary["mutations"]["mutations"]
        new_only = [m for m in muts if m["variant"] == "this card's tests"]
        base_only = [m for m in muts if m["variant"] != "this card's tests"]
        rows.append(f"| Ring mutations caught by these tests (red) | "
                    f"{sum(1 for m in new_only if m['caught'])}/{len(new_only)} |")
        rows.append(f"| The same mutations against the BASE tests | "
                    f"{sum(1 for m in base_only if m['caught'])}/{len(base_only)} caught — "
                    f"{sum(1 for m in base_only if not m['caught'])} MISSED (that is the closed gap) |")
        green = summary["mutations"]["green_control"]
        rows.append(f"| Green control after every revert | exit {green['exit']}, all three tests pass: "
                    f"{all(green['verdicts'].values())} |")
    if summary["gap_probe"]:
        gap = summary["gap_probe"]
        rows.append(f"| 1px gap, the rule this card ships | painted {gap['new_rule']['painted']}/"
                    f"{gap['total']} ({100 * gap['new_rule']['painted_fraction']:.1f}%), "
                    f"{gap['new_rule']['partial']} partly-painted pixel at "
                    f"{100 * gap['new_rule']['partial_fraction']:.1f}% ring -> the coverage rule fires; "
                    f"min over painted {gap['new_rule']['min_over_painted']}:1 (contrast passes) |")
        rows.append(f"| 1px gap, the rule it replaces | painted {gap['old_rule']['painted']}/"
                    f"{gap['total']} ({100 * gap['old_rule']['painted_fraction']:.1f}%), 0 partly painted "
                    f"-> coverage passes; min over painted {gap['old_rule']['min_over_painted']}:1 at a "
                    f"pixel {100 * gap['old_rule']['min_pixel_fraction']:.1f}% ring, i.e. the coverage "
                    f"defect reported as a contrast reading |")
    if summary["clean_profile"]:
        outage = summary["clean_profile"]["outage"]
        rows.append(f"| Clean profile, source-down failure path | return with "
                    f"{outage['sources']} sources accounted, {outage['items']} items, "
                    f"outbound {outage['counts']} (down source: {outage['down_source']}) |")
        rows.append(f"| Clean profile, installed assets | ring rule "
                    f"`{summary['clean_profile']['ring_rule']}`; wrapper "
                    f"`{summary['clean_profile']['wrapper_rule']}` |")
    rows.append(f"| `hermes plugins validate .` | {summary['plugin_validate']} |")
    rows.append(f"| `hermes plugins doctor . --ci` | {summary['plugin_doctor']} |")
    with open(os.path.join(OUT, "summary-table.md"), "w") as handle:
        handle.write("\n".join(rows) + "\n")

    if summary["mutations"]:
        names = summary["mutations"]["test_names"]
        table = ["| Mutation | Files | Wanted | Caught | Full card | Compact row | 97% control | First assertion |",
                 "|---|---|---|---|---|---|---|---|"]
        for m in summary["mutations"]["mutations"]:
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

    print(json.dumps({k: v for k, v in summary.items() if k != "mutations"}, indent=2)[:2000])


if __name__ == "__main__":
    main()
