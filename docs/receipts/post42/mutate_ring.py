"""Red-then-green proof for the ring tests, post-#42 follow-ups.

Each mutation is applied to the files it names, the three ring tests are run, and
every source is restored from the in-memory copy (never `git checkout`: the
branch's own work is uncommitted). The restore is verified by sha256 after every
mutation, so a killed run cannot leave a mutation in the tree. `node --test` is
always given a timeout: a FAILING browser test in this file can leave a fixture
server open and hang the runner.

    python3 docs/receipts/post42/mutate_ring.py

The set is the union of the mutations post-#39, post-#40 and post-#41 shipped —
alpha, opacity, `color()`, the two overflow clips, the `.dark`-only and
media-query-only token blocks, the surface-coloured ring, the CardContent-padding
case, the #41 wrapper revert and the OS-dark `@media` rule — plus this card's
three: the coverage rule back to a 95% fraction, the painted band back to 50%,
and the painted test back to a fixed channel delta.

Two of post-#40/post-#41's mutations are NOT re-run here, and the reason is in
the receipt:

  * "the coverage rule loses its partly-painted half" no longer has a rule to
    break — the partly-painted branch is diagnostic only now (the coverage rule
    reads `painted === total`), so mutating it changes no verdict;
  * "fixture CardContent padding 0" mutated the fixture's own padding CONSTANT,
    which trips the harness's guard ("the fixture's host CardContent padding line
    is missing; cannot zero it") instead of changing a rendered measurement: it
    fails the run for a harness reason, so it is not evidence about the ring. The
    padding-0 case is covered properly by the `padding: 0` entries RING_RUNS
    already carries (green control) together with the #41-wrapper revert
    mutation, which is caught by exactly those runs.

The base-tests variants of the wrapper revert and the media-query rule were
post-#41's own evidence for its items 1 and 2, and this card does not restate
them.

Where each mutation lands:

  * the ring RULE (`outline: 2px solid var(--color-ring)`), the compact row's own
    boxes and the #41 wrapper live in hackertube/dashboard/dist/style.css;
  * the ring COLOUR and the dark theme tokens are declared only in the fixture's
    host token block in tests/browser_net_harness.js (the plugin stylesheet
    consumes `var(--color-ring)` and declares no colour literal), so a colour
    mutation there is the only one that does anything;
  * the painted band and the coverage rule live in tests/test_privacy_browser.js.
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
PATTERN = "in light and dark|every pixel of every side"

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
WRAPPER_FIXED = """.hackertube .hackertube {
  padding: 0 4px;
  margin: 0 -4px;
  max-width: none;
}"""
WRAPPER_BASE = """.hackertube .hackertube {
  padding: 0;
  max-width: none;
}"""
MQ_FIXED = "  .hackertube .hackertube { padding: 0 4px; }"
MQ_BASE = "  .hackertube .hackertube { padding: 0; }"
DARK_MEDIA_RULE = """
/* A plugin rule that only fires under the OS colour scheme: the shape the
   post-#40 tests could not see, because their dark run entered through the
   `.dark` ancestor class and the OS scheme was asserted to be light. */
@media (prefers-color-scheme: dark) {
  .hackertube :focus,
  .hackertube :focus-visible { outline-color: rgba(24, 24, 27, 0.25); }
}
"""
BAND_RULE = "          if (fraction >= 0.95) painted += 1;"
COVERAGE_RULE = """    assert.ok(
      sample.total > 0 && sample.painted === sample.total,"""

MUTATIONS = [
    dict(name="compact-side clips its own overflow",
         edits=[(STYLE, COMPACT_SIDE, ".hackertube .ht-compact-side { min-width: 0; max-width: 100%; overflow-x: hidden; }")],
         expect="the compact row's measurements — the compact ring test and the coverage control (both measure the compact row)"),
    dict(name="youtube-compact wrapper clips",
         edits=[(STYLE, COMPACT_WRAP, COMPACT_WRAP + "  overflow: hidden;\n")],
         expect="the compact row's measurements — the compact ring test and the coverage control (both measure the compact row)"),
    dict(name="ring colour dim but fully painted (rgba .25)",
         # NB: this ring is 100% painted; it is the CONTRAST rule that catches it.
         edits=[(STYLE, FOCUS_RULE, FOCUS_RULE.replace(
             "outline: 2px solid var(--color-ring);", "outline: 2px solid rgba(24, 24, 27, 0.25);"))],
         expect="every measurement of a painted ring — both ring tests and the coverage control (contrast, not coverage)"),
    dict(name="compact Watch link at opacity .3 (with or without focus)",
         edits=[(STYLE, COMPACT_ANCHOR, COMPACT_ANCHOR + "  opacity: 0.3;\n")],
         expect="the compact row's measurements — the compact ring test and the coverage control"),
    dict(name="ring colour color(srgb .6 .6 .6)",
         edits=[(STYLE, FOCUS_RULE, FOCUS_RULE.replace(
             "outline: 2px solid var(--color-ring);", "outline: 2px solid color(srgb 0.6 0.6 0.6);"))],
         expect="every measurement of a painted ring — both ring tests and the coverage control"),
    dict(name="ring colour = the surface it paints on",
         edits=[(HARNESS, LIGHT_RING, LIGHT_RING.replace("--color-ring: #18181b;", "--color-ring: #ffffff;"))],
         expect="every measurement, as a coverage defect (0/163 painted)"),
    dict(name="dark-only dim ring (.dark token block)",
         edits=[(HARNESS, DARK_RING, DARK_RING.replace("--color-ring: #ffe6cb;", "--color-ring: #0b2e2e;"))],
         expect="the dark runs only (the coverage control is light-only)"),
    dict(name="the dark tokens exist only for the media query, not for an ancestor class",
         edits=[(HARNESS, DARK_SELECTOR, ":root.dark {")],
         expect="the `.dark`-ancestor runs only (no ancestor match, so the light token stays; the coverage control is light-only)"),
    dict(name="the #41 wrapper rule reverted (both copies)",
         # The acceptance mutation for the ring's room inside the plugin: only the
         # padding-0 runs can see it, because the host's own 15px padding holds
         # the ring clear of the plugin's clip whatever the wrapper declares.
         edits=[(STYLE, WRAPPER_FIXED, WRAPPER_BASE), (STYLE, MQ_FIXED, MQ_BASE)],
         expect="the padding-0 runs only — the host's own 15px padding holds the ring clear of the plugin's clip whatever the wrapper declares"),
    dict(name="a plugin rule under @media (prefers-color-scheme: dark) kills the ring",
         edits=[(STYLE, None, DARK_MEDIA_RULE)],
         expect="the os-dark runs only (the coverage control is light-only)"),
    dict(name="the coverage rule is a 95% painted fraction again",
         # The rule this card removes. Every control this card adds — the 97%
         # ring and all four 1px-gap offsets — clears a 95% fraction, so with this
         # mutation the only test that can speak is the coverage control's.
         edits=[(TEST, COVERAGE_RULE, """    assert.ok(
      sample.total > 0 && sample.painted / sample.total >= 0.95,""")],
         expect="the coverage control only"),
    dict(name="the painted band is 50% again",
         # The band post-#41 shipped. A 1px slit offset half a pixel leaves its two
         # boundary pixels at 50.2% each, so they both count as painted and the
         # side reads 163/163: the .5px gap control goes green.
         edits=[(TEST, BAND_RULE, "          if (fraction >= 0.5) painted += 1;")],
         expect="the coverage control only (the .5px gap offset)"),
    dict(name="the ring's painted test is a fixed channel delta again",
         # With `held > 20` an anti-aliased boundary pixel counts as painted, so a
         # 1px gap never reaches the coverage rule — the coverage control goes red.
         edits=[(TEST, BAND_RULE,
                 "          if ([0,1,2].some(c => Math.abs(surface[c] - ring[c]) > 20)) painted += 1;")],
         expect="the coverage control only"),
]

RING_TEST_NAMES = [
    "the full card's Watch link and its focus ring stay inside the card",
    "a compact YouTube row's Watch link focus ring reaches 3:1",
    "every pixel of every side of the ring must be painted",
]


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def run_tests():
    proc = subprocess.run(
        ["node", "--test", "--test-name-pattern", PATTERN, "tests/test_privacy_browser.js"],
        cwd=REPO, env=ENV, capture_output=True, text=True, timeout=420,
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
        if anchor is None:
            mutated[path] = mutated[path] + replacement
            continue
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
    assert source[STYLE].count(WRAPPER_FIXED) == 1, "the #41 inner-wrapper rule is not present exactly once"
    assert source[STYLE].count(MQ_FIXED) == 1, "the media-query repeat of the #41 rule is not present exactly once"
    assert source[TEST].count(BAND_RULE) == 1, "the painted band is not present exactly once"
    assert source[TEST].count(COVERAGE_RULE) == 1, "the coverage rule is not present exactly once"

    results = []
    log = []
    for mutation in MUTATIONS:
        texts = apply_edits(source, mutation["edits"])
        try:
            write_all(texts)
            code, output = run_tests()
        finally:
            write_all(source)
        for path in source:
            assert sha(open(path).read()) == originals[path], "restore failed for " + path
        green = verdicts(output)
        caught = any(value is False for value in green.values()) or code != 0
        errors = [line.strip() for line in output.splitlines() if "AssertionError" in line]
        names = [line.strip() for line in output.splitlines()
                 if line.strip().startswith("\u2716") and "test failed" not in line]
        failures = (errors + names)[:6]
        slug = mutation["name"][:48].replace(" ", "-").replace("/", "-").replace("@", "at")
        raw_dir = os.path.join(OUT, "raw")
        os.makedirs(raw_dir, exist_ok=True)
        with open(os.path.join(raw_dir, slug + ".log"), "w") as handle:
            handle.write(output)
        record = dict(name=mutation["name"],
                      files=sorted(os.path.relpath(p, REPO) for p, _, _ in mutation["edits"]),
                      variant="this card's tests", verdict=green, exit=code, expect=mutation["expect"],
                      caught=caught, failures=failures)
        results.append(record)
        log.append("\n=== " + mutation["name"] + "  ("
                   + ", ".join(sorted(os.path.relpath(p, REPO) for p, _, _ in mutation["edits"])) + ")\n"
                   + f"exit={code} caught={caught} verdicts={green}\n" + "\n".join(failures))
        print(json.dumps(record, indent=2), flush=True)

    # Green control: with every mutation restored, all three tests pass.
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

    # The raw node output under raw/ carries the checkout's path in stack traces,
    # and the check in tests/test_receipt_paths.py scans the receipts as they stand
    # on disk, so the hunt's last step is the placeholder rewrite.
    sys.path.insert(0, OUT)
    import redact_paths  # noqa: E402  (beside this file)
    redacted = redact_paths.redact()
    print(f"{len(redacted)} receipt file(s) rewritten to placeholder paths")

    misses = [m["name"] for m in results if not m["caught"]]
    if misses:
        print("NOT caught by these tests: " + ", ".join(misses))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
