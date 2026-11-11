"""Mutation proof for the painted-pixel focus-ring contrast check (post-#38).

Applies ONE mutation at a time, runs the ring tests, restores every touched file
from an in-memory copy and verifies the restore by sha256. The base copy of the
test file (the version at the card's base commit) is run for the three mutations
the OLD check is supposed to MISS, so the defect being fixed is visible in
`mutations.log` rather than asserted in prose.

Where each mutation lands, and why:
  * the ring COLOUR is declared exactly once, in the host design-token block the
    fixture serves ahead of the plugin stylesheet (`tests/browser_net_harness.js`,
    `HOST_TOKENS_CSS`); the plugin stylesheet only consumes `var(--color-ring)`.
  * `opacity` is a property of the focused link itself, so it lands in the
    plugin's own focus rule (`hackertube/dashboard/dist/style.css`).

Usage (from the repo root, with node on PATH and the harness node_modules on
NODE_PATH):

    <venv>/bin/python docs/receipts/post38/mutate_ring.py
"""
import hashlib
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PLUGIN_CSS = "hackertube/dashboard/dist/style.css"
HARNESS = "tests/browser_net_harness.js"
BASE = "ed8aebfa7e61170935903268d7b5735443ebac6b"
BASE_TEST = os.path.join(REPO, "tests/.ht38-base.js")
RING_PATTERN = "focus ring"
NEW_TEST = "tests/test_privacy_browser.js"

RING_DECL = "  --color-ring: #18181b;"
FOCUS_OFFSET = "  outline-offset: 2px;\n}"

# name, file, anchor, replacement, expectation under the new check
MUTATIONS = [
    ("ring rgba(24,24,27,.25)", HARNESS, RING_DECL, "  --color-ring: rgba(24, 24, 27, 0.25);", "red"),
    ("opacity .3 on the ring", PLUGIN_CSS, FOCUS_OFFSET, "  outline-offset: 2px;\n  opacity: 0.3;\n}", "red"),
    ("ring color(srgb .6 .6 .6)", HARNESS, RING_DECL, "  --color-ring: color(srgb 0.6 0.6 0.6);", "red"),
    ("ring set to the surface colour", HARNESS, RING_DECL, "  --color-ring: #f4f4f5;", "red"),
    ("opaque grey 2.50:1", HARNESS, RING_DECL, "  --color-ring: #9c9c9c;", "red"),
    ("opaque grey 2.90:1", HARNESS, RING_DECL, "  --color-ring: #909090;", "red"),
    ("opaque grey 3.23:1", HARNESS, RING_DECL, "  --color-ring: #888888;", "green"),
]
OLD_MISSES = ("ring rgba(24,24,27,.25)", "opacity .3 on the ring", "ring color(srgb .6 .6 .6)")


def sha256(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def run_tests(test_file, tag):
    proc = subprocess.run(
        ["node", "--test", "--test-name-pattern", RING_PATTERN, test_file],
        cwd=REPO, env=os.environ, capture_output=True, text=True, timeout=300,
    )
    out = proc.stdout + proc.stderr
    for line in out.splitlines():
        stripped = line.strip()
        if stripped.startswith(("\u2714", "\u2716")) or stripped.startswith("REPORT") \
                or "measured" in stripped or "is painted on" in stripped \
                or "partly clipped" in stripped or "is painted around the link" in stripped:
            print("      " + stripped)
    print("  [%s] exit=%s" % (tag, proc.returncode))
    return proc.returncode


def main():
    sources = {path: open(os.path.join(REPO, path), encoding="utf-8").read()
               for path in (PLUGIN_CSS, HARNESS)}
    originals = {path: sha256(os.path.join(REPO, path)) for path in sources}
    for path, digest in originals.items():
        print("%s sha256 before: %s" % (path, digest))

    subprocess.run(["git", "show", "%s:tests/test_privacy_browser.js" % BASE],
                   cwd=REPO, stdout=open(BASE_TEST, "w"), check=True)
    print("base test copy written: %s\n" % BASE_TEST)

    results = []
    try:
        for name, path, anchor, replacement, expect in MUTATIONS:
            text = sources[path]
            if text.count(anchor) != 1:
                raise SystemExit("anchor %r occurs %d times in %s" % (anchor, text.count(anchor), path))
            print("=== MUTATION: %s in %s  (expect %s) ===" % (name, path, expect))
            with open(os.path.join(REPO, path), "w", encoding="utf-8") as handle:
                handle.write(text.replace(anchor, replacement, 1))
            try:
                new_rc = run_tests(NEW_TEST, "new check")
                old_rc = run_tests(BASE_TEST, "OLD check (base test file)") if name in OLD_MISSES else None
            finally:
                with open(os.path.join(REPO, path), "w", encoding="utf-8") as handle:
                    handle.write(text)
            restored = sha256(os.path.join(REPO, path))
            assert restored == originals[path], "RESTORE FAILED for %s" % name
            print("  restore verified sha256=%s" % restored)
            green_rc = run_tests(NEW_TEST, "green after revert")
            results.append((name, expect, new_rc, old_rc, green_rc))
            print("")
    finally:
        for path, text in sources.items():
            with open(os.path.join(REPO, path), "w", encoding="utf-8") as handle:
                handle.write(text)
        if os.path.exists(BASE_TEST):
            os.remove(BASE_TEST)

    print("\n================ SUMMARY ================")
    ok = True
    for name, expect, new_rc, old_rc, green_rc in results:
        want = 0 if expect == "green" else 1
        good = (new_rc == want) and green_rc == 0
        ok = ok and good
        old = "" if old_rc is None else ("  old-check=%s" % ("GREEN -> MISSED" if old_rc == 0 else "red"))
        print("%-34s new=%-5s want=%-5s green-after-revert=%-4s%s  %s" % (
            name, "green" if new_rc == 0 else "red", expect,
            "pass" if green_rc == 0 else "FAIL", old, "OK" if good else "NOT OK"))
    print("ALL OK" if ok else "SOME NOT OK")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
