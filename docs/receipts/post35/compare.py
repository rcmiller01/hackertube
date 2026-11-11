"""Compare the pre-fix head's capture with this branch's, into row-heights.json."""
import json
import sys
from pathlib import Path

out = Path(sys.argv[1])
base = json.loads((out / "geometry-base.json").read_text())
head = json.loads((out / "geometry-head.json").read_text())
rows = []
for b in base["viewports"]:
    h = next(v for v in head["viewports"] if v["width"] == b["width"])
    rows.append({
        "width": b["width"],
        "base_gapUnderHeader": [r["gapUnderHeader"] for r in b["rows"]],
        "head_gapUnderHeader": [r["gapUnderHeader"] for r in h["rows"]],
        "rowGap": [r["rowGap"] for r in h["rows"]],
        "base_mediaTallerThanText": [r["mediaTallerThanText"] for r in b["rows"]],
        "head_mediaTallerThanText": [r["mediaTallerThanText"] for r in h["rows"]],
        "base_rowHeight": [r["rowHeight"] for r in b["rows"]],
        "head_rowHeight": [r["rowHeight"] for r in h["rows"]],
        "base_watchLink": [b["watch"]["box"]["left"], b["watch"]["box"]["right"]],
        "head_watchLink": [h["watch"]["box"]["left"], h["watch"]["box"]["right"]],
        "base_card": [b["watch"]["card"]["left"], b["watch"]["card"]["right"]],
        "head_card": [h["watch"]["card"]["left"], h["watch"]["card"]["right"]],
        "base_watchPadding": b["watch"]["padding"],
        "head_watchPadding": h["watch"]["padding"],
        "base_fullHeight": b["fullHeight"],
        "head_fullHeight": h["fullHeight"],
    })
(out / "row-heights.json").write_text(json.dumps({"base": "6ba4e4f pre-fix head", "rows": rows}, indent=2) + "\n")
print(json.dumps(rows, indent=2))
