"""Why each mutation colour lands where it does, computed from the WCAG formula.

The three opaque greys are chosen so their ratio against the light fixture's
media-column background (`#f4f4f5`, the binding surface: the white card above
and below is more forgiving) comes out on the numbers Picasso measured, and the
three "painted but unreadable" mutations are the blends Chromium actually
paints. Output is `grey-values.log`.

    <venv>/bin/python docs/receipts/post38/grey_values.py
"""


def channel(value):
    value /= 255.0
    return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])


def ratio(a, b):
    l1, l2 = luminance(a), luminance(b)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


SURF = (244, 244, 245)   # .ht-media column background (#f4f4f5) — the binding side
WHITE = (255, 255, 255)  # the card's own background


def grey_for(target, surface=SURF):
    """The opaque grey whose ratio against `surface` is exactly `target`."""
    level = (luminance(surface) + 0.05) / target - 0.05
    return round((1.055 * (level ** (1 / 2.4)) - 0.055) * 255)


print("opaque greys (chosen from the measured ratio against #f4f4f5)")
for target in (2.50, 2.90, 3.23):
    grey = grey_for(target)
    print("  target %.2f -> #%02x%02x%02x   surf=%.3f  white=%.3f" % (
        target, grey, grey, grey, ratio((grey, grey, grey), SURF), ratio((grey, grey, grey), WHITE)))

print("the shipping ring token")
print("  #18181b                     surf=%.3f  white=%.3f" % (
    ratio((24, 24, 27), SURF), ratio((24, 24, 27), WHITE)))

print("mutations that paint a blend the old check never sees")
blend = tuple(round(0.25 * a + 0.75 * b) for a, b in zip((24, 24, 27), SURF))
print("  outline-color rgba(24,24,27,.25) -> %s  surf=%.3f" % (str(blend), ratio(blend, SURF)))
blend = tuple(round(0.30 * a + 0.70 * b) for a, b in zip((24, 24, 27), SURF))
print("  opacity: .3 on the link          -> %s  surf=%.3f" % (str(blend), ratio(blend, SURF)))
print("  color(srgb .6 .6 .6)             -> rgb(153,153,153)  surf=%.3f" % ratio((153, 153, 153), SURF))
