"""Generate the post-#39 receipt tables FROM the raw logs, never by hand.

    python3 docs/receipts/post39/summarize.py

Reads pytest.log, node-full-suite.log, feed12.log, mutations.json, the plugin
CLI logs and the real-host probe JSON, and writes summary.json,
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
    tests = re.search(r"^ℹ tests (\d+)$", text, re.M)
    passed = re.search(r"^ℹ pass (\d+)$", text, re.M)
    failed = re.search(r"^ℹ fail (\d+)$", text, re.M)
    if not (tests and passed and failed):
        return None
    return dict(tests=int(tests.group(1)), passed=int(passed.group(1)), failed=int(failed.group(1)))


def feed12():
    runs = [line for line in read("feed12.log").splitlines() if line.startswith("run ")]
    ok = [line for line in runs if "exit=0" in line and "fail 0" in line]
    return dict(runs=len(runs), passed=len(ok))


def mutations():
    path = os.path.join(OUT, "mutations.json")
    if not os.path.exists(path):
        return None
    return json.load(open(path))


def host_ring():
    path = os.path.join(OUT, "host-ring.json")
    if not os.path.exists(path):
        return None
    data = json.load(open(path))
    rows = []
    for m in data["measurements"]:
        sides = m["ring"]["sides"]
        rows.append(dict(
            width=m["width"], scheme=m["scheme"], active=m["active"],
            link_left=round(m["geometry"]["box"]["left"], 2),
            ring_left=round(m["geometry"]["box"]["left"] - m["geometry"]["spread"], 2),
            nearest_clipper=m["geometry"]["clippers"][0]["name"] if m["geometry"]["clippers"] else None,
            nearest_clipper_left=round(m["geometry"]["clippers"][0]["left"], 2) if m["geometry"]["clippers"] else None,
            cut={k: v for k, v in m["ring"]["cut"].items() if v},
            sides={k: dict(painted=v["painted"], total=v["total"], min=v["min"]) for k, v in sides.items()},
        ))
    return rows


def plugin_exit(name):
    text = read(name)
    if "Validation passed." in text or "OK: runtime discovery" in text:
        return 0
    return None


def main():
    summary = dict(
        pytest=pytest_counts(),
        node=node_counts(),
        feed12=feed12(),
        mutations=mutations(),
        host_ring=host_ring(),
        plugin_validate="exit 0 (Validation passed.)" if plugin_exit("plugin-validate.log") == 0 else "see log",
        plugin_doctor="exit 0 (OK: runtime discovery, manifest parsing, import, and registration passed)"
        if plugin_exit("plugin-doctor.log") == 0 else "see log",
    )
    with open(os.path.join(OUT, "summary.json"), "w") as handle:
        json.dump(summary, handle, indent=2)

    rows = ["| Check | Result |", "|---|---|"]
    if summary["pytest"]:
        rows.append(f"| Python (pytest -q) | {summary['pytest']['passed']} passed / {summary['pytest']['failed']} failed |")
    if summary["node"]:
        n = summary["node"]
        rows.append(f"| Node full suite (`node --test tests/*.js`) | {n['tests']} tests, {n['passed']} passed / {n['failed']} failed |")
    if summary["feed12"]:
        rows.append(f"| FEED12 (10 runs) | {summary['feed12']['passed']}/{summary['feed12']['runs']} |")
    if summary["mutations"]:
        muts = summary["mutations"]["mutations"]
        red = sum(1 for m in muts if not all(m["verdict"].values()))
        rows.append(f"| Ring mutations caught (red) | {red}/{len(muts)} |")
        green = summary["mutations"]["green_control"]
        rows.append(f"| Green control after every revert | exit {green['exit']}, both tests pass: {all(green['verdicts'].values())} |")
    if summary["host_ring"]:
        clipped = [r for r in summary["host_ring"] if r["cut"]]
        rows.append(f"| Real host, compact Watch ring clipped | {'yes' if clipped else 'no'} "
                    f"({len(summary['host_ring'])} measurements: 320/390 x light/dark) |")
    rows.append(f"| `hermes plugins validate .` | {summary['plugin_validate']} |")
    rows.append(f"| `hermes plugins doctor . --ci` | {summary['plugin_doctor']} |")
    with open(os.path.join(OUT, "summary-table.md"), "w") as handle:
        handle.write("\n".join(rows) + "\n")

    if summary["mutations"]:
        table = ["| Mutation | File | Wanted | Full card | Compact row | First assertion |",
                 "|---|---|---|---|---|---|"]
        for m in summary["mutations"]["mutations"]:
            verdict = m["verdict"]
            full = "red" if verdict.get("the full card's Watch link and its focus ring stay inside the card") is False else "green"
            compact = "red" if verdict.get("a compact YouTube row's Watch link focus ring reaches 3:1") is False else "green"
            first = next((line.strip() for line in m["failures"] if "AssertionError" in line), "")
            first = first.replace("AssertionError [ERR_ASSERTION]: ", "").replace("|", "\\|")
            table.append(f"| {m['name']} | `{m['file']}` | {m['expect']} | {full} | {compact} | {first} |")
        with open(os.path.join(OUT, "mutation-table.md"), "w") as handle:
            handle.write("\n".join(table) + "\n")

    print(json.dumps({k: v for k, v in summary.items() if k != "mutations"}, indent=2))


if __name__ == "__main__":
    main()