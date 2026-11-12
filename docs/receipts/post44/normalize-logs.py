"""Publication-only log normalization: redact home prefixes and trim line tails.

No verdict, assertion, count or diagnostic text is rewritten. Source files and
historical receipt directories are never touched.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
for path in HERE.rglob("*"):
    if path.suffix not in (".log", ".tap", ".spec"):
        continue
    text = path.read_text()
    for root in ("Users", "home"):
        text = text.replace(chr(47) + root + chr(47), "<" + root + "-root>/")
    path.write_text("\n".join(line.rstrip() for line in text.splitlines()) + "\n")
print("post44 log normalization complete")
