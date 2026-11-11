"""Measure the full-card Watch link's focus ring from the captured pixels.

`capture.js` writes the same clip twice at 320px — the link unfocused and
focused — so a pixel difference isolates the outline. Its bounding box is then
compared with the link's own box: a ring that is cut by a clipping ancestor
loses the pixels on the side where it was cut, and the diff box stops short of
the expected edge.

Usage: python ring_check.py <receipt-dir> [--label head|base]
Exit 0 when every side of the ring is present, 1 otherwise.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

TOLERANCE = 1.5
SIDES = ("left", "top", "right", "bottom")


def check(receipt, label, width):
    geometry = json.loads((receipt / f"geometry-{label}.json").read_text())
    viewport = next(v for v in geometry["viewports"] if v["width"] == width)
    ring = viewport["ring"]
    if ring is None:
        raise SystemExit(f"no ring capture at {width} for label {label}")
    off = Image.open(receipt / f"watch-ring-{label}-{width}-off.png").convert("RGB")
    on = Image.open(receipt / f"watch-ring-{label}-{width}-on.png").convert("RGB")
    if off.size != on.size:
        raise SystemExit(f"clip sizes differ: {off.size} vs {on.size}")
    diff = ImageChops.difference(on, off)
    bbox = diff.getbbox()
    if bbox is None:
        raise SystemExit("the focused and unfocused captures are identical: no ring was drawn")
    link = ring["linkInClip"]
    spread = ring.get("ringSpread", 4)
    expected = {
        "left": round(link["left"] - spread),
        "top": round(link["top"] - spread),
        "right": round(link["right"] + spread),
        "bottom": round(link["bottom"] + spread),
    }
    # The capture must leave room for the whole ring, or this check could not
    # tell a cut ring from a cropped image.
    if (expected["left"] < 1 or expected["top"] < 1
            or expected["right"] > on.size[0] - 1 or expected["bottom"] > on.size[1] - 1):
        raise SystemExit(f"the capture clip is too tight for the ring: {expected} vs {on.size}")
    actual = {"left": bbox[0], "top": bbox[1], "right": bbox[2], "bottom": bbox[3]}
    failures = [side for side in SIDES if abs(actual[side] - expected[side]) > TOLERANCE]
    print(f"{label} {width}px ring spread measured={ring['ringSpread']}px clip={on.size}")
    print(f"  link in clip : {link}")
    print(f"  expected ring: {expected}")
    print(f"  pixel diff   : {actual}  ({diff.getbbox()})")
    if failures:
        print(f"  RING CUT on: {', '.join(failures)}")
        return 1
    print("  ring present on all four sides")
    return 0


def main():
    receipt = Path(sys.argv[1]).resolve()
    label = "head"
    if "--label" in sys.argv:
        label = sys.argv[sys.argv.index("--label") + 1]
    return check(receipt, label, 320)


if __name__ == "__main__":
    sys.exit(main())
