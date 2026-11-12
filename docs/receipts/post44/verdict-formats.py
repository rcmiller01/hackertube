"""Prove `mutate_ring.verdicts()` reads BOTH of Node's test-reporter formats.

    HACKERTUBE_NODE22_BIN=<dir containing node 22> \
      python3 docs/receipts/post44/verdict-formats.py

Post-#44's Cracked finding: `verdicts()` only filled its per-test map from lines
starting with U+2714 / U+2716, which is what Node 26's default spec reporter
prints. Node 22's default reporter is TAP, whose lines are `ok N - name` and
`not ok N - name`, so on Node 22 the map came out EMPTY — the exit code still
caught every mutation, but the receipt could not say WHICH test caught it.

This script runs the real ring tests under both reporters and shows the map the
pre-fix parser produced beside the one the fixed parser produces. It does not take
anyone's word for the formats: the TAP captures are produced by a real
`node --test` run of `tests/test_privacy_browser.js`, green first and then with
the strongest-difference mutation applied (which is the mutation that breaks both
classifier tests), and the source is restored from memory and verified by sha256.

`HACKERTUBE_NODE22_BIN` is required because this box's `node` is 26.x; the 22 binary
used for the captures was v22.23.5 (from `npx node@22`). Without it the script
reports that it could not run the TAP half instead of pretending it did.
"""
import hashlib
import importlib.util
import os
import subprocess
import sys

sys.dont_write_bytecode = True  # no `.pyc` under docs/ (see post43/redact_paths.py)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
TEST = os.path.join(REPO, "tests/test_privacy_browser.js")
NODE_BIN = os.environ.get("HACKERTUBE_NODE_BIN") \
    or os.path.expanduser("~/.hermes/tools/node-26.12.1-darwin-arm64/bin")
NODE22_BIN = os.environ.get("HACKERTUBE_NODE22_BIN", "")
NODE_MODULES = os.path.expanduser("~/.hermes/cache/scratch/node-modules/node_modules")

spec = importlib.util.spec_from_file_location(
    "mutate_ring", os.path.join(REPO, "docs/receipts/post43/mutate_ring.py"))
assert spec is not None and spec.loader is not None, "cannot load post43/mutate_ring.py"
mutate_ring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mutate_ring)

RING_PATTERN = mutate_ring.PATTERN
# The two tests the strongest-difference mutation breaks, and the fastest pair to
# run: the fixtures' own surfaces, no DPR matrix.
FAST_PATTERN = "gradient surface|two-tone"


def env(bindir):
    return dict(os.environ, PATH=bindir + ":" + os.environ["PATH"],
                NODE_PATH=NODE_MODULES, HACKERTUBE_NODE_MODULES=NODE_MODULES,
                PLAYWRIGHT_BROWSERS_PATH=os.path.expanduser("~/.hermes/tools"))


def run(bindir, pattern):
    proc = subprocess.run(
        ["node", "--test", "--test-name-pattern", pattern, "tests/test_privacy_browser.js"],
        cwd=REPO, env=env(bindir), capture_output=True, text=True, timeout=900)
    return proc.returncode, proc.stdout + proc.stderr


def pre_fix_parser(output):
    """`verdicts()` as it stood before post-#44: only U+2714/U+2716 are read."""
    state = {}
    for line in output.splitlines():
        for name in mutate_ring.RING_TEST_NAMES:
            if line.strip().startswith(("\u2714", "\u2716")) and name in line:
                state[name] = line.strip()[0] == "\u2714"
    return state


def report(label, code, output):
    filename = "node22-mutation.tap" if "mutation" in label else (
        "node22-green.tap" if "Node 22" in label else "node26-green.spec")
    redacted = output.replace(REPO, "<repo>").replace(str(os.path.expanduser("~")), "<home>")
    with open(os.path.join(HERE, filename), "w") as handle:
        handle.write(redacted)
    fixed = mutate_ring.verdicts(output)
    before = pre_fix_parser(output)
    print(f"\n=== {label} (exit {code})")
    print(f"    pre-fix parser: {len(before)} entries, {sum(before.values())} passed")
    print(f"    fixed parser  : {len(fixed)} entries, {sum(fixed.values())} passed")
    for name, ok in fixed.items():
        print(f"      {'PASS' if ok else 'FAIL'}  {name}")
    return fixed


def main():
    print(f"node (default, spec): {NODE_BIN}")
    code, output = run(NODE_BIN, RING_PATTERN)
    spec_map = report("ring tests, default Node (spec reporter)", code, output)

    if not NODE22_BIN:
        print("\nHACKERTUBE_NODE22_BIN is unset: the TAP half was NOT run.")
        return 0 if code == 0 and len(spec_map) == len(mutate_ring.RING_TEST_NAMES) else 1

    print(f"node 22 (TAP): {NODE22_BIN}")
    code22, tap22 = run(NODE22_BIN, RING_PATTERN)
    tap_map = report("ring tests, Node 22 (TAP reporter)", code22, tap22)

    source = open(TEST).read()
    original = hashlib.sha256(source.encode()).hexdigest()
    assert source.count(mutate_ring.CLASSIFY) == 1, "the classification line is not present exactly once"
    try:
        with open(TEST, "w") as handle:
            handle.write(source.replace(mutate_ring.CLASSIFY, mutate_ring.CLASSIFY_OLD))
        code_fail, tap_fail = run(NODE22_BIN, FAST_PATTERN)
    finally:
        with open(TEST, "w") as handle:
            handle.write(source)
    restored = hashlib.sha256(open(TEST).read().encode()).hexdigest()
    assert restored == original, "restore failed: " + TEST
    print(f"\nrestored tests/test_privacy_browser.js, sha256 {restored}")
    fail_map = report("strongest-difference mutation, Node 22 (TAP reporter)", code_fail, tap_fail)

    ok = (
        code == 0 and code22 == 0
        and len(spec_map) == len(mutate_ring.RING_TEST_NAMES) and all(spec_map.values())
        and len(tap_map) == len(mutate_ring.RING_TEST_NAMES) and all(tap_map.values())
        and code_fail != 0 and fail_map and not all(fail_map.values())
    )
    print("\nVERDICT:", "the fixed parser reads both formats" if ok else "NOT proven — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
