"""Focused old-behaviour regressions; restores and hash-checks each mutation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TEST = REPO / "tests/test_privacy_browser.js"
STYLE = REPO / "hackertube/dashboard/dist/style.css"
PYTEST = REPO / "tests/test_receipt_paths.py"
ENV = dict(os.environ, NODE_PATH=str(Path.home() / ".hermes/cache/scratch/node-modules/node_modules"),
           PLAYWRIGHT_BROWSERS_PATH=str(Path.home() / ".hermes/tools"), PYTHONDONTWRITEBYTECODE="1")
CHECKS = [
    ("strongest-pixel-red", TEST, "const reference = composite(surface);", "const reference = ringColour;", "two-tone", 1),
    ("ignored-dpr-red", TEST, "const context = await browser.newContext({deviceScaleFactor: dpr});",
     "const context = await browser.newContext({deviceScaleFactor: 1});", "in light and dark", 1),
    ("old-slit-red", TEST, "const split = ![gap.deviceY0, gap.deviceY1].every(Number.isInteger);",
     "const split = offset !== 0 || !Number.isInteger(dpr);", "every pixel of every side", 1),
    ("lighter-gradient-green", STYLE, "outline: 2px solid var(--color-ring);",
     "outline: 2px solid #767676;", "gradient surface", 0),
]
rows = []
for name, path, anchor, replacement, pattern, expected in CHECKS:
    source = path.read_text()
    assert source.count(anchor) == (2 if path == STYLE else 1)
    try:
        path.write_text(source.replace(anchor, replacement))
        proc = subprocess.run(["node", "--test", "--test-name-pattern", pattern, "tests/test_privacy_browser.js"],
                              cwd=REPO, env=ENV, capture_output=True, text=True, timeout=300)
    finally:
        path.write_text(source)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == hashlib.sha256(source.encode()).hexdigest()
    text = (proc.stdout + proc.stderr).replace(str(REPO), "<repo>").replace(str(Path.home()), "<home>")
    (HERE / (name + ".log")).write_text(text)
    assert proc.returncode == expected, (name, proc.returncode)
    rows.append(dict(name=name, exit=proc.returncode, expected=expected, restored=True))

# A filesystem walk must fail the newly added stray-bytecode regression. Run just
# that test, not the documentation scan, so the cause is the collector's input set.
source = PYTEST.read_text()
start, end = source.index("def _files(root):"), source.index("def _offenders(paths):")
try:
    PYTEST.write_text(source[:start] + 'def _files(root):\n    return [p for p in root.rglob("*") if p.is_file()]\n\n\n' + source[end:])
    proc = subprocess.run([sys.executable, "-B", "-m", "pytest", "tests/test_receipt_paths.py", "-k", "stray_local", "-q"],
                          cwd=REPO, env=ENV, capture_output=True, text=True, timeout=60)
finally:
    PYTEST.write_text(source)
assert PYTEST.read_text() == source
assert proc.returncode == 1
text = (proc.stdout + proc.stderr).replace(str(REPO), "<repo>").replace(str(Path.home()), "<home>")
for root in ("Users", "home"):
    text = text.replace(chr(47) + root + chr(47), "<" + root + "-root>/")
(HERE / "bytecode-walk-red.log").write_text(text)
rows.append(dict(name="bytecode-walk-red", exit=proc.returncode, expected=1, restored=True))
(HERE / "focused-checks.json").write_text(json.dumps(rows, indent=2) + "\n")
print(json.dumps(rows, indent=2))
