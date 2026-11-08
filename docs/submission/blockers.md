# Remaining hackathon submission blockers

Current candidate: merged PR #19, `7e1e8f9819cf840aee1f3c33e3d1233853789864`. Prepared materials are for this payload; original timeout/cancellation and stale-demo blockers are closed.

| Gate | Current evidence | Action needed |
| --- | --- | --- |
| Public repository and unauthenticated clone | GitHub reports PRIVATE; no public clone is claimed | Review public-release contents, then obtain Robert's publication instruction, make public, and verify a credential-free HTTPS clone at the exact pin plus screenshot URL access. |
| Enabled-source release acceptance (HCKT18) | Real YouTube retrieval works, but the full documented attribution/retention/refresh/deletion matrix remains open | Complete and record checks for enabled adapters; resolve the Apple audiobook source caption and any unmet obligation, or disable the affected source before release. A working demo alone does not close this gate. |
| Entrant-specific eligibility/team/originality/IP confirmation | Official announcement allows every plugin kind but gives no detailed rules on those entrant questions; MIT project license is recorded | Robert confirms the unanswered entrant-specific points or obtains organizer clarification. No disqualification or additional restriction is inferred. |
| Upstream catalog PR | Exact-pin YAML, disclosures, validation and screenshots prepared; no NousResearch/hermes-agent PR exists | After release gates/publication instruction, open the one-entry PR as owner/major contributor. Maintainer-triggered CI/merge may follow later; merge is not required for entry-form submission. |
| Public X demo post | New 29.25-second MP4 and post copy prepared; no post URL | Publish the actual video tagging @NousResearch when authorized; record and verify its public URL. |
| Entry form | Contact details retained privately; both public artifact URLs are null; nothing entered/submitted | Insert the actual X and catalog PR URLs, review the six intended field values, and submit when Robert explicitly authorizes it. |

Deadline verified from the official announcement: **November 11, 2026, 22:00 UTC (5 p.m. EST)**. [Announcement](https://x.com/NousResearch/status/2118094256438936062) · [catalog requirements](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) · [form](https://form.typeform.com/to/FwJLvOln).

## Not blockers for the agreed demo cut

- Disabled optional Reddit and Podcast Index: no approval/key is required unless those integrations are enabled or advertised as working. Reddit remains disabled; Podcast Index is visibly unavailable. Apple supplies the demonstrated podcasts.
- Seed-content expansion remains skipped. Live retrieval supplies all four media types.
- The 20-request relevance study, wider lifecycle/rollback rehearsal, refinement context, memory consent and agent entry remain post-demo work. Linux integration is unrun and disclosed; macOS is the verified platform.
- Hard timeout, Cancel, restart recovery and their two PR #19 review corrections are implemented, reviewed, merged and checked. Provider-side accepted processing/billing remains outside local cancellation guarantees.

Review/merge the materials PR in the project before treating its copy as approved. It does not change the installable plugin and does not repin the runtime away from merged PR #19.
