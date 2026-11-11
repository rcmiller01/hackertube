"""Revert ONE rule of the served stylesheet to its pre-fix form, in a COPY.

Used by ``run-host.sh base``: the real dashboard is asked to render the plugin
as it was before this card's stylesheet change, so the "before" screenshot comes
from the same server, the same profile and the same probe as the "after" one.
The working tree is never touched — this script is only ever pointed at the
copy under the disposable ``HERMES_HOME``.

    python3 docs/receipts/post40/to_base.py <path to style.css>
"""
import hashlib
import sys

FIXED = """.hackertube .hackertube {
  padding: 0 4px;
  margin: 0 -4px;
  max-width: none;
}"""
BASE = """.hackertube .hackertube {
  padding: 0;
  max-width: none;
}"""
FIXED_MQ = "  .hackertube .hackertube { padding: 0 4px; }"
BASE_MQ = "  .hackertube .hackertube { padding: 0; }"

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
assert text.count(FIXED) == 1, "the fixed inner-wrapper rule is not present exactly once"
assert text.count(FIXED_MQ) == 1, "the fixed narrow-viewport override is not present exactly once"
text = text.replace(FIXED, BASE).replace(FIXED_MQ, BASE_MQ)
with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)
print("reverted; sha256 =", hashlib.sha256(text.encode()).hexdigest())
