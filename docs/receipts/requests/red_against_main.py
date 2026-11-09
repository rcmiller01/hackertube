"""Task 3.3 red check against the pre-fix head.

This prints what the two reviewed defects did before the fix. Run it in a
checkout of the commit the review rejected (``main`` at ``6e840fd``), from
that checkout's root:

    mkdir -p /tmp/ht-main-red && git -C /path/to/hackertube worktree add /tmp/ht-main-red 6e840fd
    cp docs/receipts/requests/red_against_main.py /tmp/ht-main-red/
    cd /tmp/ht-main-red
    uv run --with pytest --python 3.14 -- python red_against_main.py

Against the fixed tree the same script reports the fixed values: the
``connect_ex`` connection is refused, and the keyed YouTube read counts
``metered`` rather than ``free``.
"""

import socket
import sys
from pathlib import Path

# The current tree keeps the library at hackertube/hackertube_core. A copy of
# this probe in an older checkout, where hackertube_core sat at the repo root,
# still imports from that root.
_HERE = Path(__file__).resolve()
_CANDIDATES = [Path.cwd(), _HERE.parent]
if len(_HERE.parents) >= 4:
    _CANDIDATES.append(_HERE.parents[3])
for _root in _CANDIDATES:
    if (_root / "hackertube" / "hackertube_core").is_dir():
        sys.path.insert(0, str(_root / "hackertube"))
        break
    if (_root / "hackertube_core").is_dir():
        sys.path.insert(0, str(_root))
        break
else:
    sys.path.insert(0, ".")

from hackertube_core import outbound  # noqa: E402
from hackertube_core.adapters import youtube  # noqa: E402
from hackertube_core.http import read_json  # noqa: E402


def _resolve(host, port, *args, **kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0))]


class _Response:
    status = 200

    def read(self, limit):
        return b'{"ok": true}'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Opener:
    def open(self, request, timeout=None):
        return _Response()


class _MonkeyPatch:
    """The minimal subset of pytest's monkeypatch that install_guard uses."""

    def __init__(self):
        self.saved = []

    def setattr(self, owner, attribute, value):
        self.saved.append((owner, attribute, getattr(owner, attribute)))
        setattr(owner, attribute, value)


def main():
    print(f"python {sys.version.split()[0]}")
    patch = _MonkeyPatch()
    outbound.install_guard(patch)
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    try:
        outbound.reset()
        try:
            rc = socket.socket().connect_ex(server.getsockname())
            print(f"connect_ex outside the boundary: CONNECTED rc={rc} (defect present)")
        except outbound.NetworkOutsideBoundary as exc:
            print(f"connect_ex outside the boundary: refused ({exc})")
        print(f"counters after connect_ex: {outbound.counters()}")

        # The keyed YouTube read is quota-metered. On the pre-fix head read_json
        # labels every read free.
        outbound.reset()
        youtube.fetch_data_api("docSampleId", "test-key", opener=_Opener(), resolve=_resolve)
        print(f"keyed YouTube read usage: {outbound.usage()}")
        if outbound.usage().get("free"):
            print("defect present: the metered read is counted as a free read")
        else:
            print("fixed: the metered read is not counted as free")

        # A caller that does not classify the read is accepted pre-fix.
        outbound.reset()
        try:
            read_json("https://example.com/catalog", opener=_Opener(), resolve=_resolve)
            print("read_json without a classification: accepted (defect present)")
        except TypeError as exc:
            print(f"read_json without a classification: refused ({exc})")
    finally:
        server.close()
        for owner, attribute, original in reversed(patch.saved):
            setattr(owner, attribute, original)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())