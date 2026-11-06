"""Host job-lifecycle probe for ctx.spawn_task. Prints redacted JSON.

Requires HERMES_HOME and PYTHONPATH pointing at the pinned Hermes checkout.
Does not read or print credentials.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path


def main() -> None:
    home = os.environ["HERMES_HOME"]
    sys.path.insert(0, os.environ["PYTHONPATH"].split(os.pathsep)[0])
    os.environ["HERMES_HOME"] = home
    from hermes_cli.plugins import PluginContext, PluginManager
    from hermes_cli.plugins_manifest import PluginManifest

    manager = PluginManager()
    ctx = PluginContext(
        PluginManifest(name="hackertube", source="user", key="hackertube"),
        manager,
    )
    report = asyncio.run(_probe(ctx, manager))
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")


async def _probe(ctx, manager) -> dict:
    observed: dict = {}

    async def bounded():
        for i in range(20):
            observed["ticks"] = i + 1
            await asyncio.sleep(0.05)

    task = ctx.spawn_task(bounded(), name="hackertube-bound")
    await asyncio.sleep(0.12)
    task.cancel()
    cancelled = False
    try:
        await task
    except asyncio.CancelledError:
        cancelled = True
    observed["cancel_raised"] = cancelled
    observed["ticks_after_cancel"] = observed.get("ticks")
    await asyncio.sleep(0.15)
    observed["ticks_settled"] = observed.get("ticks")

    hold = {"ticks": 0, "saw_cancel": False}

    async def until_unload():
        try:
            while True:
                hold["ticks"] += 1
                await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            hold["saw_cancel"] = True
            raise

    running = ctx.spawn_task(until_unload(), name="hackertube-unload")
    await asyncio.sleep(0.08)
    before = hold["ticks"]
    manager.unload()
    await asyncio.sleep(0.2)
    observed["unload"] = {
        "ticks_before": before,
        "ticks_after": hold["ticks"],
        "saw_cancel": hold["saw_cancel"],
        "done": running.done(),
    }
    observed["restart"] = await _restart()
    return observed


async def _restart() -> dict:
    receipt = Path(tempfile.mkstemp(prefix="hackertube-job-")[1])
    env = os.environ.copy()
    child = subprocess.Popen(
        [sys.executable, "-c", _CHILD, str(receipt)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    killed_ticks = None
    for _ in range(50):
        await asyncio.sleep(0.05)
        if receipt.is_file() and receipt.stat().st_size:
            try:
                payload = json.loads(receipt.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if payload.get("ticks", 0) >= 2:
                killed_ticks = payload["ticks"]
                break
    child.kill()
    child.wait(timeout=5)
    if receipt.is_file() and receipt.stat().st_size:
        killed_ticks = json.loads(receipt.read_text(encoding="utf-8")).get("ticks")
    await asyncio.sleep(0.3)
    frozen = json.loads(receipt.read_text(encoding="utf-8"))
    inspected = subprocess.run(
        [sys.executable, "-c", _INSPECT, str(receipt)],
        check=False,
        capture_output=True,
        text=True,
        env=env,
        timeout=20,
    )
    receipt.unlink(missing_ok=True)
    return {
        "killed_ticks": killed_ticks,
        "frozen_ticks": frozen.get("ticks"),
        "frozen_phase": frozen.get("phase"),
        "inspect_code": inspected.returncode,
        "inspect": inspected.stdout.strip(),
        "resumed": False,
    }


_CHILD = textwrap.dedent(
    """
    import asyncio, json, os, sys
    receipt = sys.argv[1]
    os.environ.setdefault("HERMES_HOME", os.environ["HERMES_HOME"])
    sys.path.insert(0, os.environ["PYTHONPATH"].split(os.pathsep)[0])
    from hermes_cli.plugins import PluginContext, PluginManager
    from hermes_cli.plugins_manifest import PluginManifest

    async def main():
        ctx = PluginContext(
            PluginManifest(name="restart-stub", source="user", key="restart-stub"),
            PluginManager(),
        )

        async def work():
            ticks = 0
            while True:
                ticks += 1
                open(receipt, "w", encoding="utf-8").write(
                    json.dumps({"phase": "running", "ticks": ticks})
                )
                await asyncio.sleep(0.05)

        ctx.spawn_task(work(), name="restart-stub")
        await asyncio.sleep(30)

    asyncio.run(main())
    """
)

_INSPECT = textwrap.dedent(
    """
    import json, sys
    receipt = json.loads(open(sys.argv[1], encoding="utf-8").read())
    print(json.dumps({
        "resumed": False,
        "receipt_phase": receipt.get("phase"),
        "receipt_ticks": receipt.get("ticks"),
    }))
    """
)


if __name__ == "__main__":
    main()
