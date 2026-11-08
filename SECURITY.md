# Security and release checks

Do not commit provider keys, local environment files, credentials, profile databases or private submission/audit drafts. The repository ignore rules block common local forms while allowing safe example templates; ignores do not protect secrets already in history or deliberately force-added files.

Before a public release, scan the current tracked tree and full Git history/PR refs with a current local scanner and review every alert. Use redacted reports in a private directory outside the repository. Also review screenshots, commit messages and GitHub issue/PR text; a clean text scan does not inspect pixels or external artifacts by itself. Never paste suspected credentials into public issues or a token-checking website.

The November 8 scoped audit and limitations are in [the release receipt](docs/receipts/pre-public/README.md). Its zero-confirmed finding is not a universal absence guarantee. Exact SHA-256 manifests can trigger generic-key detectors; independently verify the digest against its source blob instead of broadly disabling the rule. No credential should be dismissed merely because its filename says test.

If an actual credential is found, keep the repository private, notify its owner through a private channel, revoke/rotate it with the provider, and separately agree on history/attachment cleanup. Do not make public or rewrite published history just to make a scanner report green. This plugin gets its declared secrets through Hermes; model routing and credentials remain host-owned.
