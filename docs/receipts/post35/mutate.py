"""Replace one exact string in a file, asserting it occurs exactly once.

Usage: python mutate.py <path> <old> <new>
"""
import sys
from pathlib import Path

path = Path(sys.argv[1])
old, new = sys.argv[2], sys.argv[3]
text = path.read_text()
count = text.count(old)
if count != 1:
    raise SystemExit(f"{path}: expected exactly 1 occurrence of {old!r}, found {count}")
path.write_text(text.replace(old, new))
print(f"mutated {path}: {old!r} -> {new!r}")
