"""Check PRD-to-scenario references, without claiming implementation coverage."""

import argparse
import json
import re
from pathlib import Path


def check(root):
    change = root / "openspec/changes/hackertube-v1"
    prd = (root / "docs/PRD.md").read_text()
    rows = re.findall(r"^\| (R\d+) \|.*?\| (P[01]) \|", prd, re.M)
    if not rows or len(dict(rows)) != len(rows):
        raise ValueError("PRD requirement rows are empty or duplicated")
    requirements = dict(rows)
    mapping = json.loads((change / "traceability.json").read_text())
    if set(mapping) != set(requirements):
        raise ValueError("Traceability IDs differ from the PRD")

    proposal = (change / "proposal.md").read_text()
    section = proposal.split("### New Capabilities\n", 1)[1].split("### Modified", 1)[0]
    capabilities = re.findall(r"^- `([a-z0-9-]+)`:", section, re.M)
    specs = sorted((change / "specs").glob("*/spec.md"))
    if set(capabilities) != {p.parent.name for p in specs}:
        raise ValueError("Proposal capabilities differ from spec files")

    scenarios = set()
    count = 0
    for path in specs:
        text = path.read_text()
        count += len(re.findall(r"^### Requirement: ", text, re.M))
        ids = re.findall(r"^#### Scenario: ([A-Z]+\d+)\b", text, re.M)
        if len(ids) != len(re.findall(r"^#### Scenario: ", text, re.M)):
            raise ValueError(f"Scenario without stable ID in {path}")
        if len(set(ids)) != len(ids):
            raise ValueError(f"Duplicate scenario ID in {path}")
        scenarios.update(f"{path.parent.name}/{sid}" for sid in ids)

    referenced = set()
    deferred = []
    for rid, entry in mapping.items():
        refs = entry["scenarios"]
        if entry["status"] == "deferred":
            if requirements[rid] != "P1" or not entry.get("reason") or refs:
                raise ValueError(f"Invalid deferral for {rid}")
            deferred.append(rid)
        elif entry["status"] == "specified":
            if not refs or len(set(refs)) != len(refs) or not set(refs) <= scenarios:
                raise ValueError(f"Invalid scenario references for {rid}")
            referenced.update(refs)
        else:
            raise ValueError(f"Unknown specification status for {rid}")
    if referenced != scenarios:
        raise ValueError(f"Scenarios without PRD references: {sorted(scenarios - referenced)}")
    print(f"PASS: {len(requirements)} PRD IDs; {len(mapping) - len(deferred)} specified; "
          f"{len(deferred)} deferred ({', '.join(deferred)}); {len(specs)} capabilities; "
          f"{count} requirements; {len(scenarios)} scenarios. Runtime checks not run.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        check(args.root)
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        parser.exit(1, f"FAIL: {error}\n")
