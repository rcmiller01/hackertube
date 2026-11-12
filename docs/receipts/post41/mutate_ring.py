"""Red-then-green proof for the ring tests, post-#41 follow-ups.

Each mutation is applied to the files it names, the ring tests are run, and every
source is restored from the in-memory copy (never `git checkout`: the branch's own
work is uncommitted). The restore is verified by sha256 after every mutation, so a
killed run cannot leave a mutation in the tree. `node --test` is always given a
timeout: a FAILING browser test in this file can leave a fixture server open and
hang the runner.

    python3 docs/receipts/post41/mutate_ring.py

Three of the mutations are run TWICE: once against this card's test file and once
against the test file at the base commit (`git show <BASE_SHA>:tests/...`), so the
diff between the two runs IS the statement of the closed gap — the revert and the
media-query rule are MISSED by the base tests and caught by these.

Where each mutation lands:

  * the #41 wrapper rule (the ring's 4px inside the plugin's own padding box) lives
    in hackertube/dashboard/dist/style.css, in two places: the base rule and the
    repeat inside the `max-width: 768px` block;
  * the ring COLOUR and the dark theme tokens are declared only in the fixture's
    host token block in tests/browser_net_harness.js (the plugin stylesheet
    consumes `var(--color-ring)` and declares no colour literal), so a colour
    mutation there is the only one that does anything;
  * the painted-pixel rule and the coverage rule live in
    tests/test_privacy_browser.js.
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
BASE_SHA = "e5278dc78daddf1d55266b9f146b198be7e49d9f"

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
LIGHT_RING = """  --color-primary-foreground: #fafafa;
  --color-ring: #18181b;"""
DARK_RING = """  --color-primary-foreground: #041c1c;
  --color-ring: #ffe6cb;
}
.dark { background: #041c1c; color: #edf7f6; }"""
DARK_SELECTOR = ":root.dark, .dark {"
# The #41 rule and the rule it replaced, so a mutation can put the tree back the
# way it was before that card.
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
PAINTED_RULE = "          const isPainted = fraction >= 0.5;"
PARTIAL_RULE = "          else if (fraction > 0.05) {"
DARK_MEDIA_RULE = """
/* A plugin rule that only fires under the OS colour scheme: this is the shape
   the post-#40 tests could not see, because their dark run entered through the
   `.dark` ancestor class and the OS scheme was asserted to be light. */
@media (prefers-color-scheme: dark) {
  .hackertube :focus,
  .hackertube :focus-visible { outline-color: rgba(24, 24, 27, 0.25); }
}
"""

MUTATIONS = [
    dict(name="the #41 wrapper rule reverted (both copies)",
         # The acceptance mutation for item 1: reverting the plugin's own wrapper
         # must fail a BEHAVIOUR test. Against this card's test file it fails in
         # the padding-0 runs (the ring has no host padding to sit in); against
         # the base test file every run keeps the host's 15px inline padding and
         # the revert is invisible.
         edits=[(STYLE, WRAPPER_FIXED, WRAPPER_BASE), (STYLE, MQ_FIXED, MQ_BASE)],
         expect="caught by the padding-0 runs (0/163 painted, cut by hackertube)",
         also_base_tests=True),
    dict(name="a plugin rule under @media (prefers-color-scheme: dark) kills the ring",
         # The acceptance mutation for item 2: only the emulateMedia runs see it.
         edits=[(STYLE, None, DARK_MEDIA_RULE)],
         expect="caught by the os-dark runs only",
         also_base_tests=True),
    dict(name="the dark tokens exist only for an ancestor class, not for the media query",
         edits=[(HARNESS, DARK_SELECTOR, ":root.dark {")],
         expect="caught by the .dark-ancestor runs, not by the OS-dark runs"),
    dict(name="ring colour dim but fully painted (rgba .25)",
         edits=[(STYLE, FOCUS_RULE, FOCUS_RULE.replace(
             "outline: 2px solid var(--color-ring);", "outline: 2px solid rgba(24, 24, 27, 0.25);"))],
         expect="both ring tests (every scheme)"),
    dict(name="the ring's painted test is a fixed channel delta again",
         # The acceptance mutation for item 3: with the old test an anti-aliased
         # boundary pixel counts as painted, so the 1px gap is reported as a
         # contrast reading and this card's control goes red.
         edits=[(TEST, PAINTED_RULE, "          const isPainted = [0,1,2].some(c => Math.abs(surface[c] - ring[c]) > 20);")],
         expect="the 1px-gap control only"),
    dict(name="the coverage rule loses its partly-painted half",
         edits=[(TEST, PARTIAL_RULE, "          else if (false) {")],
         expect="the 1px-gap control only"),
]
BASE_TEST_MUTATIONS = {"the #41 wrapper rule reverted (both copies)",
                       "a plugin rule under @media (prefers-color-scheme: dark) kills the ring"}

RING_TEST_NAMES = [
    "the full card's Watch link and its focus ring stay inside the card",
    "a compact YouTube row's Watch link focus ring reaches 3:1",
    "a ring that is 97% painted passes the coverage rule",
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
    base_tests = subprocess.run(["git", "show", BASE_SHA + ":tests/test_privacy_browser.js"],
                                cwd=REPO, capture_output=True, text=True, check=True).stdout
    assert source[STYLE].count(WRAPPER_FIXED) == 1, "the #41 inner-wrapper rule is not present exactly once"
    assert source[STYLE].count(MQ_FIXED) == 1, "the media-query repeat of the #41 rule is not present exactly once"
    assert source[TEST].count(PAINTED_RULE) == 1, "the >= 50% painted rule is not present exactly once"
    assert source[TEST].count(PARTIAL_RULE) == 1, "the partly-painted rule is not present exactly once"
    assert base_tests.count("startFixture(sectionRows())") > 0, "the base test file did not come back from git"

    results = []
    log = []
    for mutation in MUTATIONS:
        variants = [("this card's tests", False)]
        if mutation.get("also_base_tests"):
            variants.append(("base tests (main)", True))
        for label, base in variants:
            texts = apply_edits(source, mutation["edits"])
            if base:
                texts[TEST] = base_tests
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
            if base:
                slug += "-base-tests"
            with open(os.path.join(raw_dir, slug + ".log"), "w") as handle:
                handle.write(output)
            expect = mutation["expect"]
            if base:
                expect = "NOT caught (the base tests keep the host padding / never emulate the OS scheme)"
            record = dict(name=mutation["name"] + ("" if label == "this card's tests" else " [" + label + "]"),
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
