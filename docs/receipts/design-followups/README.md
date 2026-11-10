# Design follow-ups receipt: Picasso findings 5-10 and N1/N2

Branch `hermes/design-followups`, base `main` `b1ec55c6caef413e21d026691d4baca914c10c4b` (#26).
Source of the items: `picasso-postmerge-REVIEW.md` findings 5-10 and
`picasso-pr26-REVIEW.md` N1/N2 (both read from the card's notes directory, not
copied here). No live or paid call; the stub provider only; `HACKERTUBE_MODEL_KEY`
was never set or read.

| Artifact | Command | What it shows |
|---|---|---|
| [python.log](python.log) | `python -m pytest tests -q` | 314 passed, 0 failed |
| [node.log](node.log) | `node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js` | 106 passed, 0 failed, 0 skipped (99 at base) |
| [red-mutations.log](red-mutations.log) | `python <scratch>/htdesign-mutations.py` | 12 mutations, each red in the named test, files restored |
| [plugin-validate.log](plugin-validate.log) | `hermes plugins validate .` | exit 0 |
| [plugin-doctor.log](plugin-doctor.log) | `hermes plugins doctor . --ci` | exit 0 |
| [clean-profile.json](clean-profile.json) | `HERMES_HOME=<fresh> python clean_profile_probe.py` | clean profile, agreement, keyless 503, stub search |
| [clean_profile_probe.py](clean_profile_probe.py) | the probe above | reproducible |
| [model-picker-390.json](model-picker-390.json) | `node model-picker-390.js` | measured 390px reflow |
| [model-picker-390.png](model-picker-390.png) / [-before](model-picker-390-before.png) | the capture above | fixed row beside the pre-fix row |
| [model-picker-390.js](model-picker-390.js) | the capture script | reproducible |

## What changed

| Item | Change | Test that fails without it |
|---|---|---|
| 5. Privacy gate focus and controls | the gate's toggle and its two actions are the SDK `Button` (native fallback if the host lacks it); the toggle carries `aria-expanded` for the state of the section it controls plus `aria-controls`; accepting mounts the page and hands focus to its heading | `the privacy disclosure reports its expanded state and accepting it moves focus to the page heading` (browser) |
| 6. YouTube attribution | one source-opening link per card: on a card that shows the linked official icon, the icon is that link and the duplicate `Open at source` control is not rendered; the icon link is named `Open "<title>" on YouTube`; the bare `YouTube` destination line is not repeated; the remaining `Open at source` links name their destination | `a YouTube card opens the source from one labelled link and does not repeat the bare source name`; `a non-YouTube card keeps its labelled source link and its destination line` |
| 7. Search panel copy | the work-budget sentence is stated once (the form note), not again on every limits line; the internal job id is not rendered | `search helpers format a cost, a limit, and a refusal without a score`; `SEARCH01 the Search control posts the question with the accepted disclosure` |
| 8. Model picker at 390px | `.ht-model-picker` is a wrapping row with a `0.5rem` gap and its `select` is capped to `max-width: 100%` | `the model picker row wraps at a narrow viewport` |
| 9. Feed refresh | a terminal Search writes `Feed updated from this search.` once to the persistent polite status region | `a finished Search announces the feed update once in the status region` |
| 10. Provider note | the static provider note no longer carries `role="status"` | `the panel warns before submitting when the live provider has no key` |
| N1 | `endSearch` expands collapsed controls before the results heading or alert is focused | `N1 a Search that ends while the controls are collapsed expands them before moving focus` |
| N2 | a job recovered on page load is marked `recovered`, and a recovered Search never moves focus when it ends (it also does not expand the controls) | `N2 a Search recovered on page load finishes without moving focus` |

The YouTube card keeps the logo as a link because the YouTube Branding
Guidelines — an integral part of the YouTube API Terms of Service — require any
YouTube logo shown in an application to link back to YouTube content. That is
why the logo link is the single source-opening link there and the duplicate
labelled control is the one removed.

## Measured 390px reflow

`model-picker-390.json`: picker width **310px** inside a **390px** viewport, the
select wrapped below its label (label top 250, select top 281), plugin root
`scrollWidth` **374px** against an inner width of 390px, so no sideways scroll.
`model-picker-390-before.png` (the pre-fix row) shows `Use for search` flush
against `Manage providers in Hermes`; `model-picker-390.png` shows the wrapped
row.

## Two test expectations that had to change with the behaviour

- `tests/test_browser_requests.js` FEED11 asserted `feed updates leave controls
  collapsed`. N1 changes exactly that, so the test now asserts the controls
  expand, the results heading takes focus, and the status region reads
  `Feed updated from this search.` Its `/feed` stub was also completed to all
  four section groups: `acceptDiscovery` rejects an incomplete document, and the
  old three-group stub was leaving `The prepared feed could not be read again.`
  in the status region instead of the feed update the test now checks.
- `tests/test_dashboard_page.js` SEARCH01 asserted the rendered `Job job:1.`
  line and the helpers test asserted the duplicated budget sentence; both now
  assert the removal.

## Scenario reconciliation

UI07 ("Collapse feed controls") stated that "feed updates preserve the collapsed
state". N1 changes that for one case, so the scenario text was amended in the
same change: a feed update caused by a profile write still preserves the
collapsed state, while a Search that ends expands the controls and moves focus
to its results heading or its alert. No other scenario text changed; strict
OpenSpec validation and the coverage check still pass.

## Clean profile

`clean-profile.json`: disposable `HERMES_HOME` `.../htdesign-cp3`, plugin
enabled as a user plugin, real `plugin_db`, real `hermes_cli.config`. The policy
agreement was accepted (200), then the default key-gated provider was asked for
a Search with no key: **503 `provider_unavailable`**, `The Hermes search service
is unavailable. No request was sent.`, outbound counters `{free: 0, metered: 0,
paid: 0}` and no job row — it fails closed. With `provider: stub` written
through Hermes's own settings writer the same route returns 200 with a succeeded
job, 10 results, and the same zero outbound counters.

## Limits

- The browser and node suites exercise the shipped bundle
  (`hackertube/dashboard/dist/index.js` + `style.css`) directly. The clean-profile
  run drives the plugin's routes in process; it does not render the dashboard
  page under a running host gateway, and no installed-host screenshot is claimed.
- No assistive-technology run. Focus and live-region statements are asserted in
  Chromium and in the component harness, not with a screen reader.
- The 390px capture renders the page bundle against the stub fixture, not the
  installed host theme.
