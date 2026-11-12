"""The receipts are published evidence, so they must not carry a machine's home
paths.

A receipt records a run on one machine, but a reader on another box can do
nothing with `/Users/<someone>/...`, and the path says who ran it and where their
home is. Every absolute home path under `docs/receipts/` is written as a
placeholder instead: `<repo>/` for the checkout, `<hermes-home>/` for the Hermes
install and its data root, `<home>/` for anything else under the user's home.

The scanner is proven against a planted sample before it is trusted with the
receipts, and the receipts tree is proven non-empty before it is trusted to have
been scanned: a scan that returns nothing because it looked in the wrong
directory, or for the wrong bytes, proves nothing — the same rule the ring tests
apply to a measurement.
"""
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
RECEIPTS = REPO / "docs" / "receipts"
FORBIDDEN = (b"/" + b"Users" + b"/", b"/" + b"home" + b"/")
# Report offenders by LABEL, never by echoing the bytes they matched: this file's
# own message is written into a receipt log (pytest's output) when it fails, and a
# message carrying the token would put the receipts permanently in the state this
# test exists to detect.
LABELS = {FORBIDDEN[0]: "Users-prefix", FORBIDDEN[1]: "home-prefix"}


def _files(root):
    return [path for path in sorted(root.rglob("*")) if path.is_file()]


def _offenders(paths):
    found = []
    for path in paths:
        data = path.read_bytes()
        hits = {LABELS[token]: data.count(token) for token in FORBIDDEN if token in data}
        if hits:
            found.append((str(path), hits))
    return found


def test_the_matcher_fires_on_a_planted_home_path(tmp_path):
    """Positive control for the scan below: it must fire when the bytes are there."""
    planted = tmp_path / "planted.log"
    planted.write_bytes(b"cwd: /Users/someone/.hermes\nroot: /home/someone/repo\n")
    assert _offenders([planted]), "a scan that cannot see a planted home path cannot certify the receipts"
    clean = tmp_path / "clean.log"
    clean.write_bytes(b"cwd: <repo>/\nroot: <hermes-home>/hermes-agent\n")
    assert _offenders([clean]) == [], "the placeholder forms must not be flagged"


def test_no_receipt_carries_an_absolute_home_path():
    files = _files(RECEIPTS)
    assert len(files) > 100, (
        f"only {len(files)} files found under {RECEIPTS}: the scan is not looking where it thinks it is")
    offenders = _offenders(files)
    detail = "; ".join(f"{path} {hits}" for path, hits in offenders[:5])
    assert not offenders, (
        f"{len(offenders)} receipt file(s) carry an absolute home path ({detail}) — write it as <repo>/, "
        f"<hermes-home>/ or <home>/ instead")
