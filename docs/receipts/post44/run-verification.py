"""Run the card's suites and clean-profile failure probe, recording real output.

Run with the suite venv's Python; Node and Hermes must be available on PATH.
Writes logs with home paths replaced BEFORE they enter the scanned docs tree.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
HOME = Path.home()
ENV = dict(os.environ, PYTHONDONTWRITEBYTECODE="1",
           NODE_PATH=str(HOME / ".hermes/cache/scratch/node-modules/node_modules"),
           PLAYWRIGHT_BROWSERS_PATH=str(HOME / ".hermes/tools"))


def cleaned(text):
    text = text.replace(str(REPO), "<repo>").replace(str(HOME / ".hermes"), "<hermes-home>").replace(str(HOME), "<home>")
    # A pytest assertion can echo the PLANTED sample from the test's source, not
    # just this machine's actual home. Do not republish that forbidden prefix.
    for root in ("Users", "home"):
        text = text.replace(chr(47) + root + chr(47), "<" + root + "-root>/")
    return text


def run(name, args, cwd=REPO, env=ENV):
    proc = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=600)
    text = proc.stdout + proc.stderr
    (HERE / (name + ".log")).write_text(cleaned(text))
    print(f"{name}: exit={proc.returncode}", flush=True)
    if proc.returncode:
        print(cleaned(text))
        raise SystemExit(proc.returncode)
    return text


def measured(pattern, text):
    match = re.search(pattern, text, re.M)
    assert match is not None, "missing count: " + pattern
    return int(match.group(1))


def main():
    collected = run("pytest-collect", [sys.executable, "-B", "-m", "pytest", "--collect-only", "-q"])
    py = run("pytest", [sys.executable, "-B", "-m", "pytest", "-q"])
    files = sorted(str(p.relative_to(REPO)) for p in (REPO / "tests").glob("*.js"))
    node = run("node-full-suite", ["node", "--test", *files])
    feed = []
    for n in range(1, 11):
        text = run(f"feed12-{n}", ["node", "--test", "--test-name-pattern", "^FEED12 ", "tests/test_browser_requests.js"])
        assert re.search(r"^ℹ pass 1$", text, re.M) and re.search(r"^ℹ fail 0$", text, re.M)
        feed.append({"run": n, "exit": 0})
    run("plugin-validate", ["hermes", "plugins", "validate", "."], cwd=REPO / "hackertube")
    run("plugin-doctor", ["hermes", "plugins", "doctor", ".", "--ci"], cwd=REPO / "hackertube")
    cp = Path(tempfile.mkdtemp(prefix="ht44-clean-", dir=HOME / ".hermes/cache/scratch"))
    (cp / "plugins").mkdir()
    (cp / "plugins/hackertube").symlink_to(REPO / "hackertube", target_is_directory=True)
    env = dict(ENV, HERMES_HOME=str(cp))
    run("clean-profile-enable", ["hermes", "plugins", "enable", "hackertube"], env=env)
    probe = run("clean-profile", [str(HOME / ".hermes/hermes-agent/venv/bin/python3"),
                                 "-B", "docs/receipts/post43/clean_profile_probe.py"], env=env)
    config = run("clean-profile-config", [str(HOME / ".hermes/hermes-agent/venv/bin/python3"), "-c",
        "import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1]))['plugins']))",
        str(cp / "config.yaml")])
    plugin_config = json.loads(config)
    assert "hackertube" in plugin_config["enabled"] and "hackertube" not in plugin_config.get("disabled", [])
    run("path-check", [sys.executable, "-B", "-m", "pytest", "tests/test_receipt_paths.py", "-q"])
    # rg's no-match exit is 1 (success for this check), not 0.
    pattern = chr(47) + "Users/|" + chr(47) + "home/"
    rg = subprocess.run(["rg", "-n", pattern, "docs", "openspec"], cwd=REPO, capture_output=True, text=True)
    assert rg.returncode == 1 and not rg.stdout and not rg.stderr
    (HERE / "path-scan.log").write_text("docs + openspec: no matches; rg exit=1\n")
    count = measured(r"(\d+) passed", py)
    collected_count = measured(r"(\d+) tests collected", collected)
    assert count == collected_count
    record = {"pytest": {"collected": collected_count, "passed": count, "failed": 0},
              "node": {k: measured(r"^ℹ " + k + r" (\d+)$", node) for k in ("tests", "pass", "fail", "skipped")},
              "feed12": feed, "plugin_validate_exit": 0, "plugin_doctor_exit": 0,
              "clean_profile_probe": json.loads(probe),
              "input_sha256": {str(p.relative_to(REPO)): hashlib.sha256(p.read_bytes()).hexdigest() for p in
                [REPO / "tests/test_privacy_browser.js", REPO / "tests/browser_net_harness.js", REPO / "tests/test_receipt_paths.py", REPO / "docs/receipts/post43/mutate_ring.py"]}}
    (HERE / "summary.json").write_text(cleaned(json.dumps(record, indent=2)) + "\n")
    print(cleaned(json.dumps(record, indent=2)))


if __name__ == "__main__":
    main()
