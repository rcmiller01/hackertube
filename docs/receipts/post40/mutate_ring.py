"""Red-then-green proof for the ring tests, post-#40.

Each mutation is applied to the files it names, the ring tests plus the
painted-fraction control are run, and every source is restored from the
in-memory copy (never `git checkout`: the branch's own work is uncommitted). The
restore is verified by sha256 after every mutation, so a killed run cannot leave
a mutation in the tree. `node --test` is always given a timeout: a FAILING
browser test in this file can leave a fixture server open and hang the runner.

    python3 docs/receipts/post40/mutate_ring.py

Where each mutation lands:

  * the ring RULE (`outline: 2px solid var(--color-ring)`, `outline-offset: 2px`)
    and the compact row's own boxes are in hackertube/dashboard/dist/style.css;
  * the ring COLOUR and the dark theme tokens are declared only in the fixture's
    host token block in tests/browser_net_harness.js (the plugin stylesheet
    consumes `var(--color-ring)` and declares no colour literal), so a colour
    mutation there is the only one that does anything;
  * the aggregation rule (`min` over painted pixels only) and the coverage rule
    live in tests/test_privacy_browser.js.
"""
import hashlib
import json
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
STYLE = os.path.join(REPO, "hackertube/dashboard/dist/style.css")
HARNESS = os.path.join(REPO, "tests/browser_net_harness.js")
TEST = os.path.join(REPO, "tests/test_privacy_browser.js")
OUT = os.path.dirname(os.path.abspath(__file__))
PATTERN = "in light and dark|97% painted"

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
DARK_RING = """  --color-primary-foreground: #041c1c;
  --color-ring: #ffe6cb;
}
.dark { background: #041c1c; color: #edf7f6; }"""
DARK_SELECTOR = ":root.dark, .dark {"
CARD_PAD = ".ht-card-content { padding: 11.25px 15px; }"
MIN_LINE = "          if (isPainted && r < min) { min = r; minAt = {x, y, surface, ring}; }"

# The inner wrapper: the fixed rule and the pre-fix rule, so a mutation can put
# the tree back the way it was before this card.
WRAPPER_FIXED = """.hackertube .hackertube {
  padding: 0 4px;
  margin: 0 -4px;
  max-width: none;
}"""
WRAPPER_BASE = """.hackertube .hackertube {
  padding: 0;
  max-width: none;
}"""

MUTATIONS = [
    dict(name="compact-side clips its own overflow",
         edits=[(STYLE, COMPACT_SIDE, ".hackertube .ht-compact-side { min-width: 0; max-width: 100%; overflow-x: hidden; }")],
         expect="compact row only"),
    dict(name="youtube-compact wrapper clips",
         edits=[(STYLE, COMPACT_WRAP, COMPACT_WRAP + "  overflow: hidden;\n")],
         expect="compact row only"),
    dict(name="ring colour dim but fully painted (rgba .25)",
         # NB: this ring is 100% painted; it is the CONTRAST rule that must catch
         # it. The earlier label called it "95%-painted but dim", which was not
         # true of the mutation.
         edits=[(STYLE, FOCUS_RULE, FOCUS_RULE.replace(
             "outline: 2px solid var(--color-ring);", "outline: 2px solid rgba(24, 24, 27, 0.25);"))],
         expect="both ring tests"),
    dict(name="compact Watch link at opacity .3 (with or without focus)",
         # The rule matches the link whether or not it is focused, so the dimming
         # is not a focus-only effect; the earlier label said "focused media".
         edits=[(STYLE, COMPACT_ANCHOR, COMPACT_ANCHOR + "  opacity: 0.3;\n")],
         expect="compact row only"),
    dict(name="ring colour color(srgb .6 .6 .6)",
         edits=[(STYLE, FOCUS_RULE, FOCUS_RULE.replace(
             "outline: 2px solid var(--color-ring);", "outline: 2px solid color(srgb 0.6 0.6 0.6);"))],
         expect="both ring tests"),
    dict(name="ring colour = the surface it paints on",
         edits=[(HARNESS, LIGHT_RING, LIGHT_RING.replace("--color-ring: #18181b;", "--color-ring: #ffffff;"))],
         expect="both ring tests"),
    dict(name="dark-only dim ring (.dark token block)",
         edits=[(HARNESS, DARK_RING, DARK_RING.replace("--color-ring: #ffe6cb;", "--color-ring: #0b2e2e;"))],
         expect="the dark runs only"),
    dict(name="the dark tokens exist only for the media query, not for an ancestor class",
         edits=[(HARNESS, DARK_SELECTOR, ":root.dark {")],
         expect="the dark runs only (no .dark ancestor match)"),
    dict(name="fixture CardContent padding 0",
         # The acceptance mutation: the host's CardContent pads by 0 and the ring
         # must still stay inside the plugin's own overflow box. Against the
         # fixed stylesheet this must PASS; against the pre-fix stylesheet the
         # same mutation must FAIL (run both and record both).
         edits=[(HARNESS, CARD_PAD, ".ht-card-content { padding: 0; }")],
         expect="not caught (the wrapper reserves the ring's 4px)",
         also_with_base_css=True),
    dict(name="the coverage rule's minimum is taken over every sampled pixel again",
         # The old aggregation: a single unpainted pixel makes the side read 1:1,
         # so the >= 95% coverage rule can never fire and a 97%-painted ring is
         # reported as a contrast defect. The two ring tests still pass; only the
         # 97%-painted control goes red — which is what makes the choice visible.
         edits=[(TEST, MIN_LINE, "          if (r < min) { min = r; minAt = {x, y, surface, ring}; }")],
         expect="the 97%-painted control only"),
]

RING_TEST_NAMES = [
    "the full card's Watch link and its focus ring stay inside the card",
    "a compact YouTube row's Watch link focus ring reaches 3:1",
    "a ring that is 97% painted passes the coverage rule",
]
BASE_CSS_MUTATIONS = {"fixture CardContent padding 0"}


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def run_tests():
    proc = subprocess.run(
        ["node", "--test", "--test-name-pattern", PATTERN, "tests/test_privacy_browser.js"],
        cwd=REPO, env=ENV, capture_output=True, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout + proc.stderr


def verdicts(output):
    """Which tests passed, read from node's own summary lines."""
    state = {}
    for line in output.splitlines():
        for name in RING_TEST_NAMES:
            if line.strip().startswith(("\u2714", "\u2716")) and name in line:
                state[name] = line.strip()[0] == "\u2714"
    return state


def apply_edits(source, edits):
    """Apply (path, anchor, replacement) edits; return the mutated text per path."""
    mutated = dict(source)
    for path, anchor, replacement in edits:
        assert mutated[path].count(anchor) == 1, (path, anchor[:60], mutated[path].count(anchor))
        mutated[path] = mutated[path].replace(anchor, replacement)
    return mutated


def write_all(texts):
    for path, text in texts.items():
        with open(path, "w") as handle:
            handle.write(text)


def main():
    source = {STYLE: open(STYLE).read(), HARNESS: open(HARNESS).read(), TEST: open(TEST).read()}
    originals = {path: sha(text) for path, text in source.items()}
    assert source[STYLE].count(WRAPPER_FIXED) == 1, "the fixed inner-wrapper rule is not present exactly once"
    assert source[TEST].count(MIN_LINE) == 1, "the painted-pixel minimum is not present exactly once"

    results = []
    log = []
    for mutation in MUTATIONS:
        variants = [("fixed stylesheet", False)]
        if mutation.get("also_with_base_css"):
            variants.append(("pre-fix stylesheet", True))
        for label, to_base in variants:
            texts = apply_edits(source, mutation["edits"])
            if to_base:
                assert texts[STYLE].count(WRAPPER_FIXED) == 1
                texts[STYLE] = texts[STYLE].replace(WRAPPER_FIXED, WRAPPER_BASE)
                assert texts[STYLE].count(".hackertube .hackertube { padding: 0 4px; }") == 1
                texts[STYLE] = texts[STYLE].replace(".hackertube .hackertube { padding: 0 4px; }",
                                                    ".hackertube .hackertube { padding: 0; }")
            try:
                write_all(texts)
                code, output = run_tests()
            finally:
                write_all(source)
            for path in source:
                assert sha(open(path).read()) == originals[path], "restore failed for " + path
            green = verdicts(output)
            caught = any(value is False for value in green.values()) or code != 0
            failures = [line for line in output.splitlines()
                        if line.strip().startswith(("\u2716", "AssertionError")) or "measured" in line][:6]
            expect = mutation["expect"]
            if to_base:
                expect = "caught (the pre-fix wrapper relies on the host's CardContent padding)"
            record = dict(name=mutation["name"] + ("" if label == "fixed stylesheet" else " [" + label + "]"),
                          files=sorted(os.path.relpath(p, REPO) for p, _, _ in mutation["edits"]),
                          variant=label, verdict=green, exit=code, expect=expect,
                          caught=caught, failures=failures)
            results.append(record)
            log.append("\n=== " + record["name"] + "  (" + ", ".join(record["files"]) + ")\n"
                       + f"exit={code} caught={caught} verdicts={green}\n" + "\n".join(failures))
            print(json.dumps(record, indent=2), flush=True)

    # Green control: with every mutation restored, the tests pass.
    code, output = run_tests()
    green = verdicts(output)
    for path in source:
        assert sha(open(path).read()) == originals[path]

    payload = dict(pattern=PATTERN, test_names=RING_TEST_NAMES, mutations=results,
                   green_control=dict(exit=code, verdicts=green),
                   restored_sha256={os.path.relpath(p, REPO): originals[p] for p in source})
    with open(os.path.join(OUT, "mutations.json"), "w") as handle:
        json.dump(payload, handle, indent=2)
    with open(os.path.join(OUT, "mutations.log"), "w") as handle:
        handle.write("\n".join(log) + f"\n\n=== green control (all restored)\nexit={code} verdicts={green}\n")
    print(json.dumps(dict(green_control=dict(exit=code, verdicts=green)), indent=2))


if __name__ == "__main__":
    sys.exit(main())
