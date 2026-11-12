"""The receipts are published evidence, so they must not carry a machine's home
paths.

A receipt records a run on one machine, but a reader on another box can do
nothing with `/Users/<someone>/...`, and the path says who ran it and where their
home is. Every absolute home path under `docs/receipts/` is written as a
placeholder instead: `<repo>/` for the checkout, `<hermes-home>/` for the Hermes
install and its data root, `<home>/` for anything else under the user's home.

The check covers `docs/` and `openspec/` too, not only `docs/receipts/`: the same
argument holds for a readiness note, a review record and a change's
`verification.md`, and those three were the last places in the tree still
carrying one. Widening it is what keeps them placeholder-only — a scan that
covers only the tree it was first written for certifies nothing about the rest.

The scanner is proven against a planted sample before it is trusted with the
tree, and each scanned tree is proven non-empty before it is trusted to have
been scanned: a scan that returns nothing because it looked in the wrong
directory, or for the wrong bytes, proves nothing — the same rule the ring tests
apply to a measurement. It also scans the PUBLISHED set rather than the
filesystem: `_files` reads `git ls-files` (tracked, plus new and not gitignored),
because a gitignored `__pycache__` is not evidence and a check that fails on the
bytecode its own pipeline deletes reports a defect no reader can see.
"""
import pathlib
import subprocess

REPO = pathlib.Path(__file__).resolve().parent.parent
RECEIPTS = REPO / "docs" / "receipts"
# Every tree this check covers. `docs` contains `docs/receipts`, so the receipt
# scan is a subset of the docs scan; both are kept because the receipt scan's
# own non-empty guard is the one that names the receipts' shape.
DOC_ROOTS = (REPO / "docs", REPO / "openspec")
# A floor per tree, so an empty or mis-rooted scan cannot pass. `docs` is the big
# one (its receipts alone are ~1200 files); `openspec` is a handful of documents.
ROOT_FLOORS = {REPO / "docs": 1000, REPO / "openspec": 10}
FORBIDDEN = (b"/" + b"Users" + b"/", b"/" + b"home" + b"/")
# Report offenders by LABEL, never by echoing the bytes they matched: this file's
# own message is written into a receipt log (pytest's output) when it fails, and a
# message carrying the token would put the receipts permanently in the state this
# test exists to detect.
LABELS = {FORBIDDEN[0]: "Users-prefix", FORBIDDEN[1]: "home-prefix"}


def _files(root):
    """Every file the repo PUBLISHES under `root`, and nothing it does not.

    The scan used to walk the filesystem (`root.rglob("*")`), so gitignored
    bytecode counted as evidence: the compiled `.pyc` of `docs/receipts/post42/
    redact_paths.py`, `post42/summarize.py` and `post43/summarize.py` carry the
    home-path token, so any stray local `__pycache__` turned this check red on
    files no reader will ever see — and `post43/redact_paths.py` exists precisely
    to delete those directories, i.e. the check was failing on the residue of its
    own pipeline. `git ls-files --cached --others --exclude-standard` is the
    published set: everything tracked, plus a NEW file that is not gitignored (so
    a document is still checked before it is committed), and nothing gitignored.
    `__pycache__` and `*.pyc` are filtered out as well, belt and braces, because a
    nested `.gitignore` could un-ignore a tree's own bytecode.
    """
    rel = root.relative_to(REPO).as_posix() + "/"
    listed = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", rel],
        cwd=REPO, check=True, capture_output=True, text=True,
    ).stdout.split("\0")
    return [
        REPO / name for name in listed
        if name
        and "__pycache__" not in pathlib.PurePosixPath(name).parts
        and not name.endswith(".pyc")
    ]


def _offenders(paths):
    found = []
    for path in paths:
        data = path.read_bytes()
        hits = {LABELS[token]: data.count(token) for token in FORBIDDEN if token in data}
        if hits:
            # Repo-RELATIVE, and never the matched bytes: this message lands in a
            # log under `docs/`, and an absolute path here would put the very
            # prefix this check forbids back into the tree — a failure that could
            # never clear.
            try:
                shown = str(path.relative_to(REPO))
            except ValueError:
                shown = path.name
            found.append((shown, hits))
    return found


def test_the_matcher_fires_on_a_planted_home_path(tmp_path):
    """Positive control for the scans below: it must fire when the bytes are there."""
    planted = tmp_path / "planted.log"
    planted.write_bytes(b"cwd: /Users/someone/.hermes\nroot: /home/someone/repo\n")
    assert _offenders([planted]), "a scan that cannot see a planted home path cannot certify the receipts"
    clean = tmp_path / "clean.log"
    clean.write_bytes(b"cwd: <repo>/\nroot: <hermes-home>/hermes-agent\n")
    assert _offenders([clean]) == [], "the placeholder forms must not be flagged"


def test_a_stray_local_bytecode_file_is_not_scanned():
    """The regression this change is for: gitignored bytecode under a scanned tree.

    `docs/receipts/post42/redact_paths.py`, `post42/summarize.py` and
    `post43/summarize.py` compile to `.pyc` files that carry the home-path token,
    and running one of them rebuilds them. They are gitignored, they are deleted by
    `post43/redact_paths.py` before the check runs, and no reader of the receipts
    ever sees them — so a stray local `__pycache__` must not be able to fail this
    check. Planted here (the same bytes the scan forbids) rather than described, and
    removed in a `finally`, so the guard is proven rather than asserted.
    """
    bytecode = REPO / "docs" / "__pycache__" / "planted_home_path_sample.pyc"
    try:
        bytecode.parent.mkdir(parents=True, exist_ok=True)
        bytecode.write_bytes(b"cwd: /Users/someone/.hermes\n")
        files = _files(REPO / "docs")
        assert bytecode not in files, (
            "a gitignored __pycache__ file is not part of the published set and must not be scanned")
        assert _offenders(files) == [], (
            "the scan must not report a home path in a file it is not supposed to read")
        assert len(files) > 100, (
            f"the scan found only {len(files)} files under docs/: it is not looking where it thinks it is")
    finally:
        bytecode.unlink(missing_ok=True)
        if bytecode.parent.exists() and not any(bytecode.parent.iterdir()):
            bytecode.parent.rmdir()


def test_no_receipt_carries_an_absolute_home_path():
    files = _files(RECEIPTS)
    assert len(files) > 100, (
        f"only {len(files)} files found under {RECEIPTS}: the scan is not looking where it thinks it is")
    offenders = _offenders(files)
    detail = "; ".join(f"{path} {hits}" for path, hits in offenders[:5])
    assert not offenders, (
        f"{len(offenders)} receipt file(s) carry an absolute home path ({detail}) — write it as <repo>/, "
        f"<hermes-home>/ or <home>/ instead")


def test_no_doc_or_spec_carries_an_absolute_home_path():
    """The same rule for `docs/` and `openspec/`, which `docs/receipts/` is a part of.

    The three files this test was widened for are a readiness note, a review
    record and a change's `verification.md` — each one an evidence document a
    reader on another box is expected to be able to follow.
    """
    problems = []
    for root in DOC_ROOTS:
        files = _files(root)
        floor = ROOT_FLOORS[root]
        assert len(files) >= floor, (
            f"only {len(files)} files found under {root} (floor {floor}): the scan is not looking where it thinks it is")
        for path, hits in _offenders(files):
            problems.append(f"{path} {hits}")
    assert not problems, (
        f"{len(problems)} file(s) under docs/ or openspec/ carry an absolute home path "
        f"({' ; '.join(problems[:5])}) — write it as <repo>/, <hermes-home>/ or <home>/ instead")

