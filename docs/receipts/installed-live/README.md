# Installed Hermes live walkthrough — November 8, 2026

## Result

The reviewed package was installed in the actual default Hermes profile, enabled, and tested through the authenticated local dashboard at `http://127.0.0.1:9119/hackertube?profile=default`. After fixing two integration defects, the gardening Search succeeded with **3 new verified books**, **5/12 logical requests**, and unknown cost. Saving a retrieved item, opening its source, and restarting the dashboard preserved the item and its saved/opened state. No additional search job was created by Save, Open, browsing, or restart: **5 jobs before and 5 after**.

Host: `Hermes Agent v0.23.0+1212.g719240d`, Python 3.14.9. Initial install revision: `9d8886ecd45473f44bb903f32c45d3f5a5eeeb88`. Final exercised code is identified by the commit containing this receipt and `runtime-manifest.json`; **34/34 installed runtime files match** that manifest. The install directory is `~/.hermes/plugins/hackertube`; the persistent database is `~/.hermes/plugin-data/hackertube/profile.db`.

## Defects found and corrected

1. The cold dashboard had not discovered built-in tools, so native `ctx.dispatch_tool("web_search", …)` returned `Unknown tool: web_search`. The earlier isolated probe explicitly imported that module and missed the cold-start condition. The **one** production native-tool dispatch site now invokes the documented public `tools.registry.discover_builtin_tools()` at explicit web search, while keeping dispatch and backend selection in Hermes. Registration/opening the plugin starts no tool/model work. The failing regression was committed in `e10dc00` before the fix.
2. The chosen reasoning model exhausted the **2,500-token** completion cap before emitting final JSON. A temporary stage-only diagnostic observed a `ChatCompletion` with `finish_reason=length`, empty final text, and no parsed result. The **one** structured-completion call site covers interpretation and ranking; interpretation retains 2,500 tokens, while ranking permits **8,000**, including hidden reasoning. The 45-second / 12-request / 24-result job limits and 60-candidate ranking input stay bounded. No automatic retry or promotion of unranked records was added. The failing native-facade regression was committed in `7e76c88` before the fix.

Four unsuccessful searches (three with missing web-tool discovery and one after only that fix) remain in the profile as `partial`, zero-result jobs. Search 5, after both fixes, is `succeeded`, with three source-backed results. Each attempt reports five logical dispatches; these are host invocations, not separately observed vendor network calls. Cost remains unknown. Temporary instrumentation was removed before the successful search and restart; no host core files were changed.

## Live procedure and evidence

- Backed up the user's existing configuration outside the repository (`install.json` gives the private backup location), copied the complete package, enabled it without tool-override permission, and restarted only the launchd-managed dashboard. The enable command also reported a normal plugin reload to the running gateway; the gateway process was not restarted.
- Opened HackerTube from the real sidebar. The model picker listed existing Hermes providers. Selected `openrouter / deepseek/deepseek-v4.1-flash` through **Use for search**; observed **Saving settings** and disabled Search, followed by the saved confirmation. The dedicated `hackertube_search` auxiliary assignment remains selected. Main model and other auxiliary settings are unchanged (`checks.json`).
- Source controls showed Hacker News, Apple, LibriVox, and Open Library enabled. YouTube and Podcast Index were unavailable for missing keys, and Reddit was unavailable for approval. None was enabled or called. The successful book query used Hacker News, Open Library, and configured Hermes web search; non-book adapters were skipped by format.
- Submitted `Find beginner books about vegetable gardening`, with the credit/quota disclosure checked. `search-result.txt` and `search-success.jpg` show the successful response, three retrieved identities, labels, bounds, and unknown cost.
- Saved the first result, `ol:OL27912661W` (Vegetable Gardening for Beginners, A. B. books). Its button changed to **Saved**, and Library showed one saved item.
- Clicked **Open at source**. The browser opened `https://openlibrary.org/works/OL27912661W`; Open Library redirected to its human-verification page. The challenge was not attempted. Source-launch behavior is verified; third-party page content beyond that checkpoint was not verified.
- Restarted the actual dashboard, reloaded the page, and opened Library. The fresh record, source link, **Saved**, **Opened**, and **Not completed** states remained (`library-after-restart.txt` / `.jpg`). The on-disk snapshots before/after are equal, including job count and one open event.

## Checks

- Python: **232 passed / 0 failed**; one existing Starlette/httpx deprecation warning.
- JavaScript/browser: **71 passed / 0 failed / 0 skipped**.
- Native-facade regressions: **2 passed / 0 failed**, with committed red receipts for each defect.
- Hermes plugin validation: passed with no warnings or private-core-import warning.
- Strict OpenSpec, coverage checks, and changed-Python lint are recorded alongside the logs.
- Codex performs reviews; the former Cracked routing requirement was replaced in `AGENTS.md` at the user's instruction.

This is one successful installed-host functional query and persistence walkthrough, not a broader relevance evaluation, public release, or demonstration of every configured model. Keyed YouTube/Podcast Index checks, Reddit approval, cancellation/restart recovery, source release obligations, and remaining release tasks keep their prior disposition. The plugin remains installed and enabled for further user testing. The PR remains unmerged.
