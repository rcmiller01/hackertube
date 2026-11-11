"""Red-then-green proof for the two painted-ring tests.

Each mutation is applied to ONE file, the two ring tests are run, and the file is
restored from the in-memory copy (never `git checkout`: the branch's own work is
uncommitted). The restore is verified by sha256 after every mutation, so a killed
run cannot leave a mutation in the tree.

    python3 docs/receipts/post39/mutate_ring.py

Style mutations go in hackertube/dashboard/dist/style.css; the ring COLOUR is
declared only in the fixture's host token block (tests/browser_net_harness.js),
so a colour mutation there is the only one that does anything. A --color-ring
edit to style.css matches nothing: the stylesheet consumes the var and declares
no colour literal.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
STYLE = os.path.join(REPO, "hackertube/dashboard/dist/style.css")
HARNESS = os.path.join(REPO, "tests/browser_net_harness.js")
TEST = os.path.join(REPO, "tests/test_privacy_browser.js")
OUT = os.path.dirname(os.path.abspath(__file__))
PATTERN = "in light and dark"

NODE_PATH = os.path.expanduser("~/.hermes/cache/scratch/node-modules/node_modules")
ENV = dict(os.environ,
           PATH=os.path.expanduser("~/.hermes/tools/node-26.12.1-darwin-arm64/bin") + ":" + os.environ["PATH"],
           NODE_PATH=NODE_PATH,
           HACKERTUBE_NODE_MODULES=NODE_PATH,
           PLAYWRIGHT_BROWSERS_PATH=os.path.expanduser("~/.hermes/tools"))

FOCUS_RULE = """.hackertube :focus,
.hackertube :focus-visible {
  outline: 2px solid var(--color-ring);
"""
COMPACT_SIDE = ".hackertube .ht-compact-side { min-width: 0; max-width: 100%; }"
COMPACT_WRAP = """.hackertube .ht-youtube-compact {
  display: flex;
  flex-wrap: wrap;
"""
COMPACT_ANCHOR = """.hackertube .ht-youtube-compact a {
  display: inline-flex;
"""
LIGHT_RING = """  --color-primary-foreground: #fafafa;
  --color-ring: #18181b;"""
DARK_RING = """    --color-primary-foreground: #18181b;
    --color-ring: #fafafa;"""

MUTATIONS = [
    dict(name="compact-side clips its own overflow",
         file=STYLE, anchor=COMPACT_SIDE,
         replacement=".hackertube .ht-compact-side { min-width: 0; max-width: 100%; overflow-x: hidden; }",
         expect="compact only"),  # 320/390 of the compact test
    dict(name="youtube-compact wrapper clips",
         file=STYLE, anchor=COMPACT_WRAP,
         replacement=COMPACT_WRAP + "  overflow: hidden;\n",
         expect="compact only"),
    dict(name="ring colour 95%-painted but dim (rgba .25)",
         file=STYLE, anchor=FOCUS_RULE,
         replacement=FOCUS_RULE.replace("outline: 2px solid var(--color-ring);",
                                        "outline: 2px solid rgba(24, 24, 27, 0.25);"),
         expect="both"),
    dict(name="focused media at opacity .3",
         file=STYLE, anchor=COMPACT_ANCHOR,
         replacement=COMPACT_ANCHOR + "  opacity: 0.3;\n",
         expect="compact only"),
    dict(name="ring colour color(srgb .6 .6 .6)",
         file=STYLE, anchor=FOCUS_RULE,
         replacement=FOCUS_RULE.replace("outline: 2px solid var(--color-ring);",
                                        "outline: 2px solid color(srgb 0.6 0.6 0.6);"),
         expect="both"),
    dict(name="ring colour = the surface it paints on",
         file=HARNESS, anchor=LIGHT_RING,
         replacement=LIGHT_RING.replace("--color-ring: #18181b;", "--color-ring: #ffffff;"),
         expect="both"),
    dict(name="dark-only dim ring (harness dark token block)",
         file=HARNESS, anchor=DARK_RING,
         replacement=DARK_RING.replace("--color-ring: #fafafa;", "--color-ring: #3f3f46;"),
         expect="dark only"),
]

TEST_NAMES = [
    "the full card's Watch link and its focus ring stay inside the card",
    "a compact YouTube row's Watch link focus ring reaches 3:1",
]


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def run_tests():
    proc = subprocess.run(
        ["node", "--test", "--test-name-pattern", PATTERN, "tests/test_privacy_browser.js"],
        cwd=REPO, env=ENV, capture_output=True, text=True, timeout=600,
    )
    return proc.returncode, proc.stdout + proc.stderr


def verdicts(output):
    """Which of the two ring tests passed, read from node's own summary lines."""
    state = {}
    for line in output.splitlines():
        for name in TEST_NAMES:
            if line.strip().startswith(("✔", "✖")) and name in line:
                state[name] = line.strip()[0] == "✔"
    return state


def main():
    source = {STYLE: open(STYLE).read(), HARNESS: open(HARNESS).read()}
    originals = {path: sha(text) for path, text in source.items()}
    for path, text in source.items():
        if path == STYLE:
            assert text.count(COMPACT_SIDE) == 1 and text.count(FOCUS_RULE) == 1
            assert text.count(COMPACT_WRAP) == 1 and text.count(COMPACT_ANCHOR) == 1
        else:
            assert text.count(LIGHT_RING) == 1 and text.count(DARK_RING) == 1
    test_sha = sha(open(TEST).read())

    results = []
    log = []
    for mutation in MUTATIONS:
        path = mutation["file"]
        text = source[path]
        assert text.count(mutation["anchor"]) == 1, (mutation["name"], text.count(mutation["anchor"]))
        mutated = text.replace(mutation["anchor"], mutation["replacement"])
        try:
            with open(path, "w") as handle:
                handle.write(mutated)
            code, output = run_tests()
        finally:
            with open(path, "w") as handle:
                handle.write(source[path])
        assert sha(open(path).read()) == originals[path], "restore failed for " + path
        green = verdicts(output)
        failures = [line for line in output.splitlines()
                    if line.strip().startswith(("✖", "AssertionError")) or "measured" in line][:6]
        record = dict(name=mutation["name"], file=os.path.relpath(path, REPO), verdict=green,
                      exit=code, expect=mutation["expect"], failures=failures)
        results.append(record)
        log.append(f"\n=== {mutation['name']}  ({os.path.relpath(path, REPO)})\n"
                   f"exit={code} verdicts={green}\n" + "\n".join(failures))
        print(json.dumps(record, indent=2), flush=True)

    # Green control: with every mutation restored, the same two tests pass.
    code, output = run_tests()
    green = verdicts(output)
    assert sha(open(TEST).read()) == test_sha
    for path in source:
        assert sha(open(path).read()) == originals[path]

    payload = dict(pattern=PATTERN, mutations=results, green_control=dict(exit=code, verdicts=green),
                   restored_sha256={os.path.relpath(p, REPO): originals[p] for p in source})
    with open(os.path.join(OUT, "mutations.json"), "w") as handle:
        json.dump(payload, handle, indent=2)
    with open(os.path.join(OUT, "mutations.log"), "w") as handle:
        handle.write("\n".join(log) + f"\n\n=== green control (all restored)\nexit={code} verdicts={green}\n")
    print(json.dumps(dict(green_control=dict(exit=code, verdicts=green)), indent=2))


if __name__ == "__main__":
    sys.exit(main())