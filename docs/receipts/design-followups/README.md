# Design follow-ups receipt: Picasso findings 5-10 and N1/N2

Branch `hermes/design-followups`, base `main` `b1ec55c6caef413e21d026691d4baca914c10c4b` (#26).
Source of the items: `picasso-postmerge-REVIEW.md` findings 5-10 and
`picasso-pr26-REVIEW.md` N1/N2 (both read from the card's notes directory, not
copied here). No live or paid call; the stub provider only; `HACKERTUBE_MODEL_KEY`
was never set or read.

| Artifact | Command | What it shows |
|---|---|---|
| [python.log](python.log) | `python -m pytest tests -q` | 314 passed, 0 failed |
| [node.log](node.log) | `node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js` | 110 passed, 0 failed, 0 skipped (99 at base) |
| [red-mutations.log](red-mutations.log) | `python <scratch>/htdesign-mutations.py` | 12 mutations, each red in the named test, files restored |
| [red-announcement.log](red-announcement.log) | the node suite with the bundle at the reviewed head | 109 run, 105 pass, 4 fail — the announcement regressions |
| [red-mutations-announcement.log](red-mutations-announcement.log) | `python <scratch>/ht-announce-mutations.py` | 4 announcement mutations, each red in its named test, file restored |
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
| 9. Feed refresh | the successful `/feed` reread that a terminal Search triggers writes `Feed updated from this search.` once to the persistent polite status region; a refresh that is still in flight, that fails, or that belongs to a profile write does not announce; a repeated sentence is blanked and re-set so each distinct Search emits a fresh change | `a finished Search announces the feed update once, after the feed refresh is accepted`; `two consecutive searches each announce the feed update once`; `a failed feed refresh after a Search never announces the success`; `only a Search's own feed refresh announces the search update`; `FEED12 …` (browser) |
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
same change, and the review's second finding qualified both affected scenarios
for a Search recovered on page load (N2, which moves focus and expands nothing):
a feed update caused by a profile write still preserves the collapsed state,
while a Search started in this page session that ends expands the controls and
moves focus to its results heading or its alert, and a recovered Search does
neither; UI06's focus sentence draws the same distinction. No other scenario
text changed; strict OpenSpec validation and the coverage check still pass.

## Review rework: the announcement's lifecycle and the N2 scenario exception

The review of head `8432b904` found two things. Both are fixed on this branch.

**Finding 9 announced the wrong moment, and only once.** The notice was written
at the terminal Search, before the `/feed` reread that actually re-ranks the
feed had resolved, and nothing changed the region for a second Search whose
sentence was identical. Now a terminal Search leaves a one-shot claim
(`feedNoticeRequested`) and the `/feed` reread consumes it: the region is written
only when `acceptDiscovery` accepts that response, so a refresh still in flight
or a failed one stays silent, and a profile write's own refresh cannot announce
it. The claim is consumed at the start of the read, so a superseded read cannot
announce at all. When the region already holds the sentence, it is blanked and
the sentence is re-set on the next frame (`requestAnimationFrame` in a browser,
`setTimeout` in the harness, which has no frame): the polite region then emits a
real blank-then-text change for each distinct Search instead of ignoring a
repeated string. The approved sentence is unchanged.

Verified in Chromium with a MutationObserver on `.ht-status`, holding each
search-triggered `/feed` response (`FEED12`): while the first refresh was held
the region was quiet and empty of the sentence; releasing it produced the
sentence once; a second Search was quiet while held, and on release produced
`["", "Feed updated from this search."]` — the fresh change. The unit harness
holds the same refresh through a new deferred-`/feed` option.

**The scenario reconciliation omitted N2.** UI06 and UI07 still promised focus
and expansion for every finished Search, while a recovered job (N2) does
neither. Both scenario texts now distinguish a Search started in this page
session from a recovered job. This qualifies an approved requirement; no product
decision changed.

Red first: [red-announcement.log](red-announcement.log) is the node suite with
the bundle at the reviewed head and the new tests in place — 109 run, 105 pass,
4 fail. Four single-piece mutations were then reverted from the fix one at a
time, each red in its named test and each restored
([red-mutations-announcement.log](red-mutations-announcement.log)):

| Mutation | Red in |
|---|---|
| no blank-and-reset (re-set the identical sentence) | `two consecutive searches each announce the feed update once`; `FEED12` |
| announce on every feed read, not only a Search's own | `only a Search's own feed refresh announces the search update` |
| announce at the terminal Search, before the read is accepted | `a finished Search announces the feed update once, after the feed refresh is accepted`; `a failed feed refresh after a Search never announces the success`; `FEED12` |
| the one-shot claim is not consumed | `only a Search's own feed refresh announces the search update` |

## Clean profile

`clean-profile.json`: disposable `HERMES_HOME` `.../htdesign-cp4` (a fresh home:
no agreement, no saved provider), the worktree's plugin symlinked in as a user
plugin, real `plugin_db`, real `hermes_cli.config`, run with the Hermes venv
python (`HERMES_HOME=... <hermes>/venv/bin/python3 clean_profile_probe.py`). The
policy agreement was accepted (200), then the default key-gated provider was
asked for a Search with no key: **503 `provider_unavailable`**, `The Hermes
search service is unavailable. No request was sent.`, outbound counters
`{free: 0, metered: 0, paid: 0}` and no job row — it fails closed. With
`provider: stub` written through Hermes's own settings writer the same route
returns 200 with a succeeded job, 10 results, and the same zero outbound
counters. `HACKERTUBE_MODEL_KEY` is absent from the environment.

## Limits

- The browser and node suites exercise the shipped bundle
  (`hackertube/dashboard/dist/index.js` + `style.css`) directly. The clean-profile
  run drives the plugin's routes in process; it does not render the dashboard
  page under a running host gateway, and no installed-host screenshot is claimed.
- No assistive-technology run. Focus and live-region statements are asserted in
  Chromium and in the component harness, not with a screen reader. The repeat
  announcement is evidenced as observed DOM mutations of the live region (a
  blank, then the sentence), which is what a polite region acts on; it is not a
  measured screen-reader utterance, and the frame that re-sets the sentence is
  `requestAnimationFrame`, which the unit harness lacks (it falls back to
  `setTimeout` and is synchronous).
- The 390px capture renders the page bundle against the stub fixture, not the
  installed host theme.
