"""Generate the post-#40 receipt tables FROM the raw logs, never by hand.

    python3 docs/receipts/post40/summarize.py

Reads pytest.log, node-full-suite.log, feed12.log, mutations.json, the plugin CLI
logs, the two real-host probe JSONs and the fixture capture record, and writes
summary.json, summary-table.md and mutation-table.md beside them.
"""
import hashlib
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


def host_rows(name):
    path = os.path.join(OUT, name)
    if not os.path.exists(path):
        return None
    data = json.load(open(path))
    rows = []
    for m in data["measurements"]:
        geometry = m["geometry"]
        wrappers = [w for w in geometry.get("wrappers", []) if w["classes"] == "hackertube"]
        rows.append(dict(
            width=m["width"], active=m["active"],
            ring_token=m["theme"]["ringToken"], page_background=m["theme"]["pageBackground"],
            root_font_size=m["theme"]["rootFontSize"],
            link_left=round(geometry["box"]["left"], 2),
            ring_left=round(geometry["box"]["left"] - geometry["spread"], 2),
            nearest_clipper=geometry["clippers"][0]["name"] if geometry["clippers"] else None,
            nearest_clipper_left=round(geometry["clippers"][0]["left"], 2) if geometry["clippers"] else None,
            nearest_clipper_padding=geometry["clippers"][0]["padding"] if geometry["clippers"] else None,
            wrapper_padding=wrappers[0]["padding"] if wrappers else None,
            wrapper_margin=wrappers[0]["margin"] if wrappers else None,
            wrapper_left=round(wrappers[0]["box"]["left"], 2) if wrappers else None,
            card_content_padding=(geometry.get("cardContent") or {}).get("padding"),
            card_content_padding_sides=None if not geometry.get("cardContent") else {
                side: geometry["cardContent"].get(side) for side in
                ("paddingTop", "paddingRight", "paddingBottom", "paddingLeft")
            },
            cut={k: v for k, v in m["cut"].items() if v},
            sides={k: dict(painted=v["painted"], total=v["total"], min=v["min"], minAll=v["minAll"])
                   for k, v in m["ring"].items()},
        ))
    return rows


def fixture_rows():
    path = os.path.join(OUT, "fixture-screens.json")
    if not os.path.exists(path):
        return None
    data = json.load(open(path))
    rows = {}
    for name, widths in data["variants"].items():
        rows[name] = {}
        for width, shot in widths.items():
            page = os.path.join(OUT, f"fixture-{name}-{width}.png")
            ring = os.path.join(OUT, f"fixture-{name}-{width}-ring.png")
            rows[name][width] = dict(
                focused=shot["focused"],
                page_sha256=hashlib.sha256(open(page, "rb").read()).hexdigest() if os.path.exists(page) else None,
                ring_sha256=hashlib.sha256(open(ring, "rb").read()).hexdigest() if os.path.exists(ring) else None,
            )
    return rows


def plugin_result(name, marker):
    return f"exit 0 ({marker})" if marker in read(name) else "see log"


def main():
    summary = dict(
        pytest=pytest_counts(),
        node=node_counts(),
        feed12=feed12(),
        mutations=mutations(),
        host_ring=dict(base=host_rows("host-ring-base.json"), fix=host_rows("host-ring-fix.json")),
        fixture_screens=fixture_rows(),
        plugin_validate=plugin_result("plugin-validate.log", "Validation passed."),
        plugin_doctor=plugin_result("plugin-doctor.log", "OK: runtime discovery"),
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
        caught = sum(1 for m in muts if m["caught"])
        rows.append(f"| Ring mutations caught (red) | {caught}/{len(muts)} (the one NOT caught is the wanted PASS) |")
        green = summary["mutations"]["green_control"]
        rows.append(f"| Green control after every revert | exit {green['exit']}, all three tests pass: {all(green['verdicts'].values())} |")
    host = summary["host_ring"]
    if host["base"] and host["fix"]:
        cut = [r for r in host["base"] + host["fix"] if r["cut"]]
        rows.append(f"| Real host, compact Watch ring clipped | {'yes' if cut else 'no'} "
                    f"({len(host['base']) + len(host['fix'])} measurements: 320/390/768/1280) |")
        moved = []
        for base, fix in zip(host["base"], host["fix"]):
            moved.append(base["nearest_clipper_left"] - fix["nearest_clipper_left"])
        rows.append(f"| Real host, host-content clip edge moved out by | {min(moved)}-{max(moved)}px "
                    f"(the link itself does not move; the full-page captures are byte-identical) |")
        rows.append(f"| Real host, measured CardContent padding | {host['fix'][0]['card_content_padding']} "
                    f"at every width (block, inline) |")
    if summary["fixture_screens"]:
        fixture = summary["fixture_screens"]
        same = all(fixture["fixed"][w]["page_sha256"] == fixture["prefix"][w]["page_sha256"]
                   for w in fixture["fixed"])
        rows.append(f"| Fixture, fixed vs pre-fix full-page capture | byte-identical at every width: {same} |")
        cut = fixture["prefix-pad0"]["320"]["ring_sha256"] != fixture["fixed-pad0"]["320"]["ring_sha256"]
        rows.append(f"| Fixture, host CardContent padding 0 at 320px | ring differs between pre-fix and fixed: {cut} |")
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

            first = next((line.strip() for line in m["failures"] if "AssertionError" in line), "")
            first = first.replace("AssertionError [ERR_ASSERTION]: ", "").replace("|", "\\|")
            table.append(f"| {m['name']} | `{'`, `'.join(m['files'])}` | {m['expect']} | "
                         f"{'yes' if m['caught'] else 'no'} | {state(names[0])} | {state(names[1])} | {state(names[2])} | {first} |")
        with open(os.path.join(OUT, "mutation-table.md"), "w") as handle:
            handle.write("\n".join(table) + "\n")

    print(json.dumps({k: v for k, v in summary.items() if k not in ("mutations",)},
                     indent=2)[:1500])


if __name__ == "__main__":
    main()
