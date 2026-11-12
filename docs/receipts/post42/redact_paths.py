"""Rewrite absolute home paths under `docs/receipts/` as placeholders.

    python3 docs/receipts/post42/redact_paths.py

  <repo> the checkout a receipt was produced from
  <hermes-home> the Hermes install and its data root
  <home> anything else under a user's home directory

`run-suite.sh` calls this as its last step, because the logs it has just written
carry a home path in them (pytest's warning summary names the venv's site-packages
file) and the check in `tests/test_receipt_paths.py` scans the receipts as they
stand on disk.

Byte-level, so binary files are untouched, and only files that contain one of the
prefixes are rewritten: a receipt's measured content changes only where a path
appears. The prefixes are assembled from pieces so that this file cannot match
itself.
"""
import os
import re
import sys

OUT = os.path.dirname(os.path.abspath(__file__))
RECEIPTS = os.path.dirname(OUT)
USER_HOME = b"/" + b"Users" + b"/robert"
HOME_PREFIX = b"/" + b"home"

PATTERN = re.compile(re.escape(b"/" + b"Users") + rb"/|" + re.escape(HOME_PREFIX) + rb"/")
RULES = [
    (re.compile(re.escape(USER_HOME + b"/Developer/hackertube")), b"<repo>"),
    (re.compile(re.escape(USER_HOME + b"/.hermes")), b"<hermes-home>"),
    (re.compile(re.escape(USER_HOME + b"/")), b"<home>/"),
    (re.compile(re.escape(USER_HOME) + rb"\b"), b"<home>"),
    (re.compile(re.escape(HOME_PREFIX) + rb"/[A-Za-z0-9_.-]+"), b"<home>"),
]


def redact(paths=None):
    changed = []
    for path in paths if paths is not None else walk(RECEIPTS):
        with open(path, "rb") as handle:
            data = handle.read()
        if not PATTERN.search(data):
            continue
        new = data
        for pattern, replacement in RULES:
            new = pattern.sub(replacement, new)
        if new != data:
            with open(path, "wb") as handle:
                handle.write(new)
            changed.append(os.path.relpath(path, RECEIPTS))
    return changed


def walk(root):
    for dirpath, _, names in os.walk(root):
        for name in names:
            yield os.path.join(dirpath, name)


def main():
    changed = redact()
    print(f"{len(changed)} receipt file(s) rewritten to placeholder paths")
    for path in sorted(changed):
        print(" ", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
