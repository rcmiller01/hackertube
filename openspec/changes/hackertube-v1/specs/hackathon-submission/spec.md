## Purpose

Define the observable artifacts and checks required for the Hermes Agent Plugin Hackathon submission. These scenarios describe preparation and evidence. They do not authorize a public release, catalog PR, X post, or form submission.

## ADDED Requirements

### Requirement: Deadline and public review candidate
The entrant SHALL complete the three submission steps by November 11, 2026 at 5 p.m. EST, which is 22:00 UTC. The plugin repository SHALL be publicly cloneable over HTTPS by then. Every kind of plugin is eligible under the official announcement.

#### Scenario: HCKT01 Submission deadline
- **WHEN** the submission checklist is reconciled against the official announcement
- **THEN** the catalog PR, demo-post URL, and entry form have a recorded completion time before November 11, 2026 at 22:00 UTC

#### Scenario: HCKT02 Public clone and loadable tree
- **WHEN** a reviewer clones the candidate HTTPS repository URL without credentials at its pinned full commit
- **THEN** the clone succeeds and the tree contains a supported plugin manifest and at least one loadable entry point

### Requirement: Catalog pull request and ownership
A plugin repository owner or major contributor SHALL open a PR to NousResearch/hermes-agent containing one valid catalog entry. The entry SHALL pin a full 40-character plugin commit and quote its version.

#### Scenario: HCKT03 Catalog entry at exact commit
- **WHEN** the proposed catalog diff is inspected
- **THEN** it adds one entry file with a 40-character commit SHA, a quoted version, and the fields required by the canonical entry schema

#### Scenario: HCKT04 Submitter authorization
- **WHEN** the catalog PR is opened
- **THEN** the PR author's identity and owner-or-major-contributor relationship to the plugin repository are recorded

### Requirement: Catalog validation and compatible declarations
The plugin SHALL pass the catalog's local validation command with dependency installation at the exact pinned commit. Declared capabilities and compatibility metadata SHALL match observed behavior and requirements.

#### Scenario: HCKT05 Validation at pinned commit
- **WHEN** `hermes plugins validate /path/to/your-plugin --install-deps` runs against a checkout of the pinned commit
- **THEN** it exits successfully with no failure and all warnings are recorded for review

#### Scenario: HCKT06 Declarations match plugin
- **WHEN** the manifest and catalog metadata are compared with the loaded plugin
- **THEN** capabilities, registered behavior, version, dependency constraints, and `requires_hermes` agree without undeclared additions

### Requirement: Public interfaces and safe operation
The plugin SHALL extend only documented Hermes interfaces. It SHALL NOT patch core or Desktop markup, bypass approvals, hang unattended runs, or ship unscannable executable payloads.

#### Scenario: HCKT07 No core or Desktop override
- **WHEN** reviewers inspect the pinned tree and catalog validation runs
- **THEN** no prohibited runtime override, core patch, or Desktop markup access is found and any requested missing hook has a tracked upstream request

#### Scenario: HCKT08 Approvals and unattended behavior
- **WHEN** the plugin runs under its declared interactive and unattended paths
- **THEN** it preserves approval gates and fails or times out cleanly when a person is unavailable

#### Scenario: HCKT09 Reviewable package contents
- **WHEN** the pinned file inventory is scanned
- **THEN** all executable content is reviewable source or satisfies the catalog's attested native-component exception

### Requirement: Working demo video on X
The entrant SHALL post a video under 90 seconds on X and tag @NousResearch. The video SHALL show the plugin working rather than a presentation or mockup.

#### Scenario: HCKT10 Demo cut under 90 seconds
- **WHEN** the final demo video is measured and reviewed
- **THEN** its duration is under 90 seconds and it shows the page, seeded feed, one focused search, save, source opening, and Karpathy credit in the running plugin

#### Scenario: HCKT11 Public X post
- **WHEN** the prepared X post is inspected before publication and its public URL is opened afterward
- **THEN** it contains that demo video, tags @NousResearch, and supplies the URL required by the entry form

### Requirement: Complete official entry form
The entry form SHALL contain the required plugin title, description, email address, Discord username, X demo-post URL, and catalog-PR URL.

#### Scenario: HCKT12 Required form values
- **WHEN** Robert reviews the completed form before its external submission
- **THEN** every required field has its intended value and both URLs resolve to the corresponding public artifacts

### Requirement: Judge-visible product evidence
The working plugin and submission description SHALL provide evidence relevant to usefulness, reliability, polish, and creativity. The behavior SHALL exceed what a prompt or skill alone could do.

#### Scenario: HCKT13 Plugin behavior rather than prompt packaging
- **WHEN** a judge reviews the demo and plugin description against the official criteria
- **THEN** the evidence identifies persistent plugin state, source adapters, dashboard behavior, bounded jobs, and verified results rather than only prompt instructions

### Requirement: Hermes-managed credentials
Plugin-owned API keys SHALL use declared `requires_env` or secret `config_schema` entries and Hermes secret scope. Third-party OAuth SHALL use the manifest's declared OAuth route. Direct credential-file reads SHALL NOT occur.

#### Scenario: HCKT14 Plugin-owned secret fallback
- **WHEN** a required plugin model or search key is unavailable through a host API and the user enters a plugin-owned key in its secret setting
- **THEN** Hermes stores the credential and the plugin reads only that declared secret through secret scope without writing it to plugin data

#### Scenario: HCKT15 Credential stores remain untouched
- **WHEN** plugin source and runtime reads are reviewed
- **THEN** no direct read of `.env`, `auth.json`, another tool's login, a browser profile, or a keychain occurs and OAuth tokens are handled only through the declared Hermes route

### Requirement: Reviewed immutable catalog build
The catalog build SHALL NOT replace its own files. Updates SHALL use a new catalog PR that changes the exact SHA pin and receives another review.

#### Scenario: HCKT16 No self-updating code
- **WHEN** a reviewer inspects installation, update, and background paths at the pinned commit
- **THEN** no path downloads or replaces plugin code outside a reviewed SHA-bump PR and Hermes update flow

### Requirement: Disclosure, source terms, and post-demo evidence
The catalog PR and README SHALL disclose third-party network calls, data reads, storage, credentials, and other risky behavior and include UI screenshots. Adapters SHALL honor current provider terms. Post-demo tasks SHALL verify lifecycle rehearsal and the 20-request relevance evaluation after the demo.

#### Scenario: HCKT17 README and PR disclosure
- **WHEN** the candidate README and catalog PR are compared with observed behavior
- **THEN** network destinations, storage, credentials, provider terms, and risky behavior are disclosed and the PR contains UI screenshots

#### Scenario: HCKT18 Source retention and attribution
- **WHEN** each enabled source adapter is tested with live metadata and simulated deletion or expiry
- **THEN** it honors its documented attribution, retention, refresh, deletion, and redistribution constraints or remains disabled

#### Scenario: HCKT19 Lifecycle rehearsal after demo
- **WHEN** the post-demo release rehearsal performs update, disable/re-enable, rollback, and documented uninstall retention
- **THEN** library state and supported settings survive as documented and rollback returns to the prior reviewed commit

#### Scenario: HCKT20 Twenty-request relevance evaluation after demo
- **WHEN** the post-demo frozen 20-request set is scored with the accepted rubric and source snapshots
- **THEN** verification records the sample, results, failures, and format coverage without claiming an unmeasured relevance target

### Requirement: Distinct plugin lineage and reviewable content
The candidate SHALL NOT be a vendor-lookalike skin or competing bundled-plugin listing. A fork SHALL satisfy the catalog's material-difference and upstream-contribution conditions and disclose its origin. Native components SHALL satisfy the catalog's build-attestation exception.

#### Scenario: HCKT21 Distinct listing and disclosed derivation
- **WHEN** the candidate is compared with bundled plugins and existing community listings
- **THEN** it is not a skin or trivial fork and any permitted derivation names its origin and satisfies the lineage rule

#### Scenario: HCKT22 Native payload provenance
- **WHEN** an otherwise reviewable package includes a necessary native component
- **THEN** the component comes from the repository's public attested build or an allowed pinned upstream setup download and is disclosed

### Requirement: Vendor-owned password-manager backends
HackerTube SHALL NOT register a `browser_vault` login backend. A future backend SHALL remain out of scope unless it satisfies the catalog's vendor, repository, and tier conditions.

#### Scenario: HCKT23 No third-party password-manager backend
- **WHEN** registered login backends are inspected at the pinned commit
- **THEN** HackerTube registers no `browser_vault` backend and credential access stays within the declared API-key and OAuth routes
