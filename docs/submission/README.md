# Prepared submission packet

Prepared November 8, 2026. **Not submitted or published.** The repository remains private; PR17 remains unmerged. Seed expansion is deliberately skipped.

- Demo: `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo/hackertube-demo.mp4` — 36.25 seconds, real installed plugin, silent screen capture sampled at about five frames/second and encoded at 20 fps. No slides, mock results, sped-up search, or removed search wait. The six actions are open page, browse prepared catalog, live focused search, Save, open original source, show Karpathy credit. The final page is explicitly prepared marketplace copy.
- Screenshots and exact checks: [rehearsal receipt](../receipts/demo-rehearsal/README.md).
- Listing copy: [marketplace description](../marketplace-description.md).
- Installable-package disclosure: [plugin README](../../hackertube/README.md).
- Catalog entry draft: `catalog-entry.yaml`, to be copied to `plugin-catalog/hackertube.yaml` in a separately authorized NousResearch/hermes-agent PR. The draft pins verified implementation commit `026b3d7b6ad2060490ce31929b2c3e9779684ef9`; the canonical Hermes parser accepted it. Later PR commits add verification and submission-draft updates; the plugin payload is unchanged from that pin. Screenshots/video remain the disclosed original rehearsal; the review receipt adds a current pre-search screenshot.
- Catalog PR text: [draft](catalog-pr.md).
- X post: [draft](x-post.md). Upload and publication are separate actions.
- Intended form contact values are in `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo/entry-form.private.json`, outside Git. Robert supplied them directly. X and catalog PR URLs remain null until those artifacts are published; do not submit null or placeholder values.

## Release and submission gates

1. Review/merge the implementation candidate separately. Validate the exact final catalog pin again if it changes. Making the repository public needs a separate instruction, then verify an unauthenticated HTTPS clone at that pin. A private authenticated clone does not meet the public-clone gate.
2. Complete source-specific release obligations. Credentialed YouTube search works, but the wider retention/deletion/attribution acceptance matrix remains open; Podcast Index has not been live-tested, and Reddit has no approval. Do not describe this as a fully cleared community recommendation catalog.
3. Host in-flight calls can exceed the forwarded work budget. One rehearsal stalled during DeepSeek ranking and was stopped by restarting only the local dashboard. There is no plugin cancellation or interrupted-job recovery. The successful demo uses the already configured OpenRouter provider with `openai/gpt-5.4-mini`; the main model is untouched.
4. Resolve unanswered eligibility, team-size, originality, and IP terms against official rules. MIT is the project's recorded license, not evidence of eligibility. Do not infer permission from silence.
5. With separate publication authorization, publish the repository, open the catalog PR as owner/major contributor with screenshots/disclosures, and publish the video on X tagging @NousResearch. Insert the two actual public URLs into the local form draft and verify them.
6. Review and submit the entry form separately. The project’s recorded deadline is **November 11, 2026, 5 p.m. EST / 22:00 UTC**. This session rechecked the catalog guidance, but X returned 403 and the Typeform was unavailable to the research tool; the event deadline/form fields are carried from the existing project specification, not newly verified official terms.

Official catalog guide: https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission
Recorded official announcement: https://x.com/NousResearch/status/2118094256438936062
Recorded form: https://form.typeform.com/to/FwJLvOln
