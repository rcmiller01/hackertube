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
        for sid in ids:
            qualified = f"{path.parent.name}/{sid}"
            if qualified in scenarios:
                raise ValueError(f"Duplicate scenario ID across specs: {qualified}")
            scenarios.add(qualified)

    referenced = set()
    deferred = []
    mixed_rows = []
    post_demo_rows = []
    post_demo_references = {}
    for rid, entry in mapping.items():
        refs = entry["scenarios"]
        if entry["status"] == "deferred":
            if (requirements[rid] != "P1" or not entry.get("reason") or refs
                    or "post_demo_scenarios" in entry):
                raise ValueError(f"Invalid deferral for {rid}")
            deferred.append(rid)
        elif entry["status"] in {"demo", "post-demo"}:
            if (not refs or len(set(refs)) != len(refs)
                    or not set(refs).issubset(scenarios)):
                raise ValueError(f"Invalid scenario references for {rid}")
            if "post_demo_scenarios" not in entry:
                raise ValueError(f"Missing post-demo scenario subset for {rid}")
            post_refs = entry["post_demo_scenarios"]
            if not isinstance(post_refs, list):
                raise ValueError(f"Invalid post-demo scenario subset for {rid}")
            if (any(not isinstance(ref, str) for ref in post_refs)
                    or len(set(post_refs)) != len(post_refs)
                    or not set(post_refs).issubset(refs)):
                raise ValueError(f"Invalid post-demo scenarios for {rid}")
            if post_refs and requirements[rid] != "P0":
                raise ValueError(f"Only P0 rows can have post-demo scenarios for {rid}")
            if post_refs and not entry.get("reason"):
                raise ValueError(f"Missing post-demo reason for {rid}")
            if not post_refs and entry.get("reason"):
                raise ValueError(f"Unexpected post-demo reason for {rid}")
            if entry["status"] == "demo":
                if post_refs and set(post_refs) == set(refs):
                    raise ValueError(f"Demo row cannot defer every scenario for {rid}")
                if post_refs:
                    mixed_rows.append(rid)
                    post_demo_references[rid] = post_refs
            elif set(post_refs) != set(refs):
                raise ValueError(f"Post-demo row must be a complete subset for {rid}")
            else:
                post_demo_rows.append(rid)
                post_demo_references[rid] = post_refs
            referenced.update(refs)
        else:
            raise ValueError(f"Unknown specification status for {rid}")
    if referenced != scenarios:
        raise ValueError(f"Scenarios without PRD references: {sorted(scenarios - referenced)}")
    post_demo_scenarios = {ref for refs in post_demo_references.values() for ref in refs}
    print(f"PASS: {len(requirements)} PRD IDs; {len(mapping) - len(deferred)} delivery-mapped; "
          f"{len(deferred)} deferred ({', '.join(deferred)}); "
          f"{len(mixed_rows)} demo rows with post-demo subsets ({', '.join(mixed_rows)}); "
          f"{len(post_demo_rows)} fully post-demo rows ({', '.join(post_demo_rows)}); "
          f"{len(post_demo_scenarios)} post-demo scenarios; {len(specs)} capabilities; "
          f"{count} requirements; {len(scenarios)} scenarios. Runtime checks not run.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        check(args.root)
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        parser.exit(1, f"FAIL: {error}\n")
