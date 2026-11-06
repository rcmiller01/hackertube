# Hermes host feasibility

Recorded 2026-11-06 against a disposable profile. This is the lane A receipt for tasks 1.1, 1.2, and 1.4. The shell in `hackertube/` is the layout later lanes build into. It is not the feed, search, library, or About view.

Tested plugin revision: `6601ddf9e962510c6a11f880dc85262d032e541d`. That commit is the `hackertube/` tree these probes ran. Receipts added after it do not change those files. Host revision: `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`. Artifacts live in [docs/receipts/feasibility/](receipts/feasibility/).

## Version pin

Pinned release: **Hermes Agent v0.23.0 (2026.9.24)**.

| Field | Value |
|---|---|
| Tag | `v0.23.0` |
| Commit | `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19` |
| Published | 2026-11-05 |
| Channel | `stable` (installer `--channel stable`) |
| Install method | git checkout of that tag |
| Python | 3.14.9 |
| `hermes --version` | `Hermes Agent v0.23.0 (2026.9.24) · stable · local 2bd378ed1b8d` |

This pin **is** the v0.23.0 release. It is not a newer release. v0.23.0 was the newest GitHub release on 2026-11-06. PyPI's `hermes-agent` package stopped at 0.19.0, so the pin is the git tag, not a PyPI version.

`requires_hermes` in `hackertube/plugin.yaml` is `>=0.23.0`. Catalog rule 14 allows a floor that is not newer than the current release. This floor matches the pin.

### Relation to the Mac

The Mac reports `v0.23.0+155.g14ffb99 (2026.9.24)`, installed via git, upstream `44ec783a`, with 10 local carried commits, on Python 3.14.9.

The `(2026.9.24)` stamp is the same text the v0.23.0 release prints. It is not a second version. `v0.23.0+155` means 155 commits after tag `v0.23.0`.

GitHub compare of `v0.23.0...44ec783afd1193afb7576d9c01d7fe9d18c87339` (2026-11-06, "Merge pull request #149786") is **ahead by 145, behind by 0**. Commit `14ffb99` is not on GitHub. The remaining 10 commits are the local carried commits. This probe does not use them and does not use the 145 unreleased commits.

PluginContext method names checked here are the same on the tag and on `44ec783a`: `llm`, `dispatch_tool`, `register_web_search_provider`, `spawn_task`, `side_question`. These files had no diff in that range: `agent/plugin_llm.py`, `agent/web_search_provider.py`, `agent/web_search_registry.py`, `plugins/plugin_storage.py`, `agent/secret_scope.py`.

Diffs that do exist, and do not change this shell:

- Dashboard auth on the newer tree also accepts `X-Hermes-Session-Token` in gated mode when no cookie or bearer is present. The pin already uses that header for loopback token auth.
- The newer tree imports a dashboard `plugin_api.py` through `plugin_isolation.import_user_code`. It still requires a module-level `router`.
- Context-reference registration is staged until plugin load succeeds.
- The newer tree warns when code imports the `gateway.session_context` module instead of `get_session_env`. This shell imports neither.

The Mac can stay ahead of the tag. Matching the pin means checking out `v0.23.0` and not depending on the 10 local commits. This probe did not run on the Mac.

## Language and runtime

**The Hermes plugin backend is Python.** `plugin.yaml` plus `__init__.py:register(ctx)` is the native plugin. `dashboard/plugin_api.py` is a FastAPI `APIRouter` loaded by the dashboard. Lane B's `hackertube_core` Python package can be imported from those modules. This lane did not create or edit that package.

**The dashboard page is not Python.** It is one prebuilt JavaScript IIFE, `dashboard/dist/index.js`. It uses `window.__HERMES_PLUGIN_SDK__` (`SDK.React` and `SDK.components`) and calls `window.__HERMES_PLUGINS__.register`. React is not bundled. There is no frontend build step in this repo.

The probe profile ran the host on Python 3.14.9. FastAPI in that environment was 0.133.1.

## Layout

```text
hackertube/
  plugin.yaml                 # native manifest
  __init__.py                 # register(ctx); registers nothing
  dashboard/manifest.json     # web tab
  dashboard/dist/index.js     # page that says HackerTube
  dashboard/plugin_api.py     # router, one GET /status
```

Install it as a **user** plugin at `$HERMES_HOME/plugins/hackertube` and add `hackertube` to `plugins.enabled`. On this host a user plugin's Python API is not imported unless that allow-list contains its name. A project plugin under `./.hermes/plugins/` can serve static JS, and its Python API is not auto-imported.

Checked on the disposable profile with `hermes plugins enable hackertube`.

| Surface | Entry |
|---|---|
| Native manifest | `hackertube/plugin.yaml` (`name: hackertube`, `version: 0.1.0`) |
| Native register | `hackertube/__init__.py` function `register` |
| Dashboard manifest | `hackertube/dashboard/manifest.json` |
| Tab | path `/hackertube`, label `HackerTube`, icon `Globe`, position `end` |
| Page bundle | `dashboard/dist/index.js`, served at `/dashboard-plugins/hackertube/dist/index.js` |
| Page registration | `window.__HERMES_PLUGINS__.register("hackertube", HackerTubePage)` |
| Backend | `dashboard/plugin_api.py` module global `router` |
| HTTP | `GET /api/plugins/hackertube/status` |

`hermes plugins validate hackertube --install-deps` exited 0. Every check passed, including manifest fields, `requires_hermes`, config schema, capability probe, security scan, and no core override. Warnings: none. The plugin declares no Python dependencies. Log: [validate.log](receipts/feasibility/validate.log). The isolation line in that log is the validator's static "can run in the plugin host" verdict. The disposable profile does not set `plugins.isolation`.

## Data root

`plugins.plugin_storage.plugin_data_dir("hackertube")` creates and returns `$HERMES_HOME/plugin-data/hackertube`. The status route returns that path and does not write a product file. Secrets do not belong in this directory. Saved library items are not implemented, so LIB02's save behavior is not done. Task 2.2 owns that. The status body after a process restart still named that data directory: [reload-restart.log](receipts/feasibility/reload-restart.log).

## Auth

Loopback dashboard (`--host 127.0.0.1`): `/api/*` routes other than the public list require the process session token. The header name on this pin is `X-Hermes-Session-Token`. `Authorization: Bearer <token>` is also accepted by the server. The HTML shell injects the token so the page can call the API.

Observed on the loopback dashboard. Captures redact the session token and the profile home.

| Call | Result | Artifact |
|---|---|---|
| `GET /api/plugins/hackertube/status` with no token | `401` `{"detail":"Unauthorized"}` | [http-401.txt](receipts/feasibility/http-401.txt) |
| Same call with `X-Hermes-Session-Token` and no key stored | `200`, `model_key` `absent`, data root under `plugin-data/hackertube` | [http-200-absent.txt](receipts/feasibility/http-200-absent.txt) |
| Browser `location.reload()` on `/hackertube` | Heading `HackerTube`. Nav href `/hackertube`. | [reload-restart.log](receipts/feasibility/reload-restart.log), [hackertube-after-reload.png](receipts/feasibility/hackertube-after-reload.png) |
| Kill the server, start it again, open `/hackertube` | Heading visible again. Authenticated status `200`, `model_key` `absent`. | [reload-restart.log](receipts/feasibility/reload-restart.log) |

Non-loopback gated auth (cookie or OAuth provider) was not exercised. Do not treat the loopback token result as that mode.

## ctx.llm and search

The dashboard binding does not receive `ctx`. `plugin_api.py` is imported and its `router` is mounted under `/api/plugins/<name>/`. The request does install the profile secret scope (`_plugin_route_secret_scope` / `_config_profile_scope`). It does not pass a `PluginContext`.

On a real `PluginContext` for this plugin, at this pin:

| Check | Observed |
|---|---|
| `ctx.llm` | `agent.plugin_llm.PluginLlm` |
| Methods present | `complete`, `complete_structured`, `acomplete`, `acomplete_structured` |
| `ctx.dispatch_tool` | present |
| `ctx.search` / `ctx.web_search` | absent |
| `ctx.register_web_search_provider` | present. It registers a search backend. It does not run a search. |
| `ctx.side_question` | present. Not called. The pin's docs say it sees the session, including memory, and it requires capability `llm.side_question` plus a turn token. This plugin does not declare that capability. |

Memory-disabled payload: `complete(messages=[{"role":"user","content":"PROBE_MEMORY_DISABLED"}])` forwarded exactly that one message. The captured message JSON did not contain a memory field. This used an injected caller so no provider was contacted. `side_question` was not part of the payload. Artifact: [model-payload.json](receipts/feasibility/model-payload.json).

Live `ctx.llm.complete(...)` did not complete. The host raised `AuxiliaryClientUnavailable`: `No LLM provider configured for task=None provider=auto. Run: hermes setup`. The probe did not read `auth.json`, `.env`, or any other credential file. The profile had no model provider. The same artifact records that error.

Search: there is no dashboard HTTP search route in the pinned `hermes_cli/web_server*.py` tree. `ctx.dispatch_tool("web_search", {"query": "site:nousresearch.com hermes agent", "limit": 1})` returned a JSON object with `"success": true` and a web result whose URL was `https://hermes-agent.nousresearch.com/`. The active provider at that moment was `exa` with `is_available()` false and `is_keyless_available()` true. An earlier resolution returned `keenable` with the same flags. That call needs `ctx`, which the dashboard route does not have. `tools.web_tools` is not in the pin's public plugin import list (`hermes_cli/plugin_validate_private_imports.py`). This shell does not import it.

### Chosen path

The dashboard page cannot call `ctx.llm` or `dispatch_tool`. A live model call also has no host provider in a fresh profile. The chosen path is the pre-decided plugin-owned key.

`hackertube/plugin.yaml` declares it as a secret config field, not `requires_env`, so a missing key does not disable the page:

```yaml
config_schema:
  model_key:
    type: secret
    env: HACKERTUBE_MODEL_KEY
    required: false
```

Hermes stores `type: secret` values in the profile `.env` under `HACKERTUBE_MODEL_KEY` (`hermes_cli.plugins_settings.secret_env_name` uses the `env:` name). `GET /status` calls `agent.secret_scope.get_secret("HACKERTUBE_MODEL_KEY")` and returns `present` or `absent`. It does not return the value.

On the running dashboard, with the key unset, the status body said `absent`. After Hermes stored a placeholder and the same process served another authenticated status call, the body said `present`. The plugin data directory did not contain the placeholder. After Hermes removed the placeholder, the body said `absent` again. Artifacts: [secret-check.log](receipts/feasibility/secret-check.log), [http-200-absent.txt](receipts/feasibility/http-200-absent.txt), [http-200-present.txt](receipts/feasibility/http-200-present.txt), [http-200-after-remove.txt](receipts/feasibility/http-200-after-remove.txt). No key is in this repository.

Plugin source mention of the word "credential" is the manifest description telling the reader not to open credential files. The shell does not open `.env`, `auth.json`, a keychain, or another tool's login.

SEARCH01 is not implemented. PREF05's product search is not implemented. The payload check is the memory-disabled evidence for this task. HCKT14's storage path was exercised with a placeholder and then cleared. HCKT15's source review found no credential-file read.

## Jobs

No product job runner was added. The probe script is [job_probe.py](receipts/feasibility/job_probe.py). Its redacted log is [job-probe.log](receipts/feasibility/job-probe.log). It used `ctx.spawn_task` and deterministic asyncio stubs on this pin.

| Action | Observed |
|---|---|
| Cancel the task | `CancelledError` in the stub. Ticks stopped at 3 and stayed there. |
| `PluginManager.unload()` while a second stub ran | The stub saw `CancelledError`. Ticks stopped at 2. The task was done. |
| Kill the process after a stub had written 2 ticks | A new interpreter read the same receipt: phase `running`, ticks `2`. It did not resume the stub. |

`spawn_task` is an in-process asyncio task. Unload cancels it. Process death drops it. This host did not write a job record and did not restart the work. A paid call inside a cancelled task is cancelled only if that call honors task cancellation. The host did not report a separate in-flight disposition.

Later lanes should persist the demo search's identity, limits, and terminal state in the plugin data root. Do not treat `spawn_task` as a durable job. Do not silently rerun paid work after a restart. JOB05 and JOB06 product behavior stays in task 6.2. JOB03's product budget behavior is not implemented; the stub only shows that a cancelled task stops.

## Unverified

- Non-loopback gated dashboard auth.
- A live `ctx.llm` completion against a configured provider.
- `ctx.side_question`, including its memory contents.
- Two profiles (PREF07, task 6.4).
- Whether the keyless `web_search` result is allowed for this product. It worked once. It is not the chosen path.
- `plugins.isolation: host` as a running mode. The profile left the setting unset, which this source treats as `in_process`.
- Whether the dashboard process calls `register(ctx)`. The page and `/status` work with `register` doing nothing.
- Running this shell on the Mac's `v0.23.0+155` tree.

## Six-step demo

PRD section 13:

1. Open the HackerTube page. The host can do this. This shell does it.
2. Show a seeded feed. Not built.
3. Run one focused search. Not built. The page cannot call `ctx.llm` or `web_search` until a later lane uses `HACKERTUBE_MODEL_KEY` from secret scope, or until the dashboard binding is given a `PluginContext` and a host provider. A fresh profile has no host provider, and the live `ctx.llm` call failed closed.
4. Save a result. Not built. The data root survives a process restart; saved items do not exist yet.
5. Open the result at its source. Not built. URL opening was not probed.
6. Show the Andrej Karpathy credit in About and the marketplace description. The repository README already has the credit. This page has no About view. The marketplace description is not written.

Nothing in the host probe blocks step 1. Step 3 is the host-shaped blocker: the dashboard route has no `ctx`, and a model call needs the plugin-owned key (or a host provider that this profile does not have). Steps 2, 4, 5, and 6 are product work, not missing host entry points.
