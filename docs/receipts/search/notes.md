# Search receipts: scope, evidence, and limits

Artifacts for tasks 4.1 and 4.2 (the explicit demo Search). Recorded
2026-11-07 on this box. Every file here was produced by a command quoted in
`openspec/changes/hackertube-v1/verification.md`.

| Artifact | Command | What it shows |
|---|---|---|
| [collect.log](collect.log) | `python -m pytest tests --collect-only -q` | 201 tests collected |
| [pytest.log](pytest.log) | `python -m pytest tests -q` | 201 passed, 0 failed |
| [node.log](node.log) | `node --test tests/test_dashboard_page.js tests/test_browser_requests.js` | 57 passed, 0 failed |
| [mutation.log](mutation.log) | `python <scratch>/ht41_mutation.py` | Five production mutations, each red in the named tests, then restored |
| [validate.log](validate.log) | `hermes plugins validate .` | exit 0, no warnings |
| [doctor.log](doctor.log) | `hermes plugins doctor . --ci` | exit 0 |
| [profile.log](profile.log) | `HERMES_HOME=<disposable> <hermes venv>/bin/python3 docs/receipts/search/search_profile_probe.py` | clean-profile behaviour, recorded as JSON |
| [search_profile_probe.py](search_profile_probe.py) | the probe above | the clean-profile run, reproducible |

## What the search does

`hackertube_core/search.py` is the whole engine. One explicit Search:

1. **Interprets the question** into a topic, requested formats, depth, and a
   hard time limit. The reading is deterministic; the stub provider uses it
   directly, and the live provider reads the same shape out of a model
   answer.
2. **Finds candidates** in the loaded catalog by the shared term gate
   (`boundaries.matches_terms`), then verifies each against an unexpired
   retrieved record. A candidate whose record is missing, expired, or
   dropped is not a result.
3. **Applies a hard time limit** to the item's own duration. Unknown
   duration is labeled unverified against the limit and kept out of strict
   matches; a known over-limit duration is not a result.
4. **Labels every source.** A community endorsement keeps its own line; a
   catalog record is labeled with its source name; a broader-web record is
   labeled `Web: <name>` and gains no community endorsement.
5. **Reports partial format coverage.** A requested format with no verified
   record says so instead of being filled from another format.

The job (`search_job` table in the profile database, written through
`ProfileStore` and therefore through Hermes `plugin_db`) records the
question, the provider, the bounded limits, the request count, the result
count, the terminal state, the coverage notes, and the cost.

## The two providers

- `stub` — the deterministic local provider. It makes **no** outbound call,
  reports no cost, and supports scripted failure (`timeout`, `error`) and a
  truncated run. This is the demo cut.
- `live` — the keyed provider. It reads the declared secret through
  `agent.secret_scope.get_secret` and posts one request through
  `hackertube_core.http` inside `outbound.dispatch(PAID, ...)`. With the key
  or the endpoint absent it raises before any outbound call.

`plugin.yaml` declares both settings: `provider` (`live` default, `stub`
selectable) and `model_endpoint` (empty by default). The route reads them
through the published `hermes_cli.config` surface, the same reader the
settings hub uses.

## Limits of this receipt

- **No live model call was made and no key was set.** `HACKERTUBE_MODEL_KEY`
  is absent everywhere in these runs (the probe prints
  `secret_never_set: true`). The live provider's *successful* path is not
  proven; only its one-request-through-the-boundary path with an injected
  offline opener, and its fail-closed refusal. Live-provider proof stays
  open for the cut that ships a key.
- **The stub provider is the provider under test.** "Verified" therefore
  means "admitted by the retrieved-record check", not "a model judged it
  relevant". No relevance measurement is claimed; that is task 6.6.
- **`model_endpoint` has no default.** Selecting `live` without an endpoint
  also refuses. Choosing a provider endpoint is not a decision this card
  makes.
- **The browser-side numbers** in `node.log` come from a stub local API with
  offline artwork, exactly as the task 3.3 receipt records; they measure
  attempts, not live delivery.
- **Install from GitHub was not run.** The clean-profile probe enables the
  plugin as a user plugin in a disposable home and drives the plugin's own
  router in process. Host installation at the pinned release is task 5.2.
