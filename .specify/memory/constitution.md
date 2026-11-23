# HealthQ Copilot — constitution

- **Phase and date:** Phase 4, 2026-11-22. Version 2 (version 1, called 1.0.0 in earlier reports, was approved the same day)
- **Requirement IDs covered:** GOV-11
- **Assumptions:** the reference system is `imatiqul/azure-ai-cloud-healthcare` at commit `6e0879d2`, as verified in Phase 1; profile Regulated with the HIPAA pack; all example data is synthetic
- **Unverified:** nothing here has been applied to the healthcare repository. 13 of the 25 principles name at least one check that does not exist yet (listed in `constitution.map.yml` as `status: not built`)

**Approved at gate G0 by the owner on 2026-11-22**, in chat, in these words: "Needs you: approve". He holds the three roles G0 needs (Product Owner, Solutions Architect, Security and Compliance). It was approved as drafted, including the two numbers an agent had proposed: 80 percent in P-22 and 600 lines in P-24.
This approval is recorded here and in the README's progress table, as earlier phases were. It is not a kit decision record: the constitution is not yet in a repository where a pull-request review can pass a gate.

**Amended to version 2 on 2026-11-22**, approved by the owner at G0 again ("Batch 2, waiting on you: go ahead"). One sentence of P-7 changed; see "Amendments" at the end.

An agent wrote the text from the twelve topics in `docs/prompts/reference/20-healthq.md` and the 27 findings of Phase 1. A change to it is an amendment: a new version, a report of what the change affects, and G0 again.

Each principle says what must be true, why this system needs it (the Phase 1 findings in brackets), and how it is checked. "Kit check" means a check that exists in agentic-spec-kit today. "To build" means a test or rule that the spec for the finding must add to the healthcare repository; until it exists the principle is stated, not enforced.

## Identity and access

### P-1 Authentication fails closed
A service with no identity provider configured refuses to start anywhere but a developer's machine. There is no fallback identity, on the server or in the browser, and no silent demo mode. [C1, H3]
Checked by, to build: `arch-test:no-fallback-identity`.

### P-2 Every endpoint is authorized
Every HTTP, GraphQL and message endpoint names the policy that guards it. An endpoint that is public is on an allowlist that Security and Compliance reviewed. Route guards in the browser mirror the server's policies and never replace them. [C2, H2, H3]
Checked by: kit check CK-SECURITY-EVIDENCE (an authorization matrix where an endpoint changed); to build: `arch-test:endpoint-authorization`.

### P-3 Access to patient data is scoped to the tenant and the patient
A caller reaches only the data of their own tenant and of patients they are entitled to see. A request for anything else is refused, not filtered to empty. [C2]
Checked by, to build: `integration-test:cross-tenant-and-patient-denied`.

### P-4 Identity comes from the validated token only
User, tenant and roles are read from the token the gateway validated. A header or a request body never asserts them, including for break-glass access. [C3]
Checked by, to build: `arch-test:no-caller-asserted-identity`.

### P-5 Nothing is exposed by default
Cross-origin access, public endpoints, demo routes and seed routes exist only where a reviewed allowlist says so. [N6, H4]
Checked by, to build: `arch-test:exposure-allowlists`.

## Protected health information

### P-6 Minimum necessary
A feature uses only the PHI fields it needs, and its spec says which and why. [H1]
Checked by: kit checks CK-PRIVACY-IMPACT and CK-DOMAIN-SECTIONS (the HIPAA pack's "Minimum Necessary" section).

### P-7 PHI is redacted at every boundary and encrypted in the field at rest
PHI is redacted before it reaches a model provider or a log. Redaction is not behind a feature flag. PHI fields are encrypted at rest. No patient identifier or conversation is kept in browser storage. [H1]
Checked by, to build: `test:phi-redaction-at-boundaries`, `arch-test:phi-fields-encrypted`, `lint:no-phi-in-browser-storage`.

### P-8 Only synthetic data outside production
Seed data, fixtures, test data, prompts and examples contain no real personal or health data.
Checked by: kit checks CK-SYNTH-DATA and CK-TEST-DATA.

## Audit

### P-9 Every access to PHI is attributed
Each read or change of PHI writes a record that names the authenticated user, the tenant, the patient and the outcome. A record never says "anonymous". [C4, N4]
Checked by, to build: `integration-test:audit-attribution`.

### P-10 The audit trail is complete, durable and append-only
There is one logical trail: every store that holds audit records is on the system map and is included in an export. A request whose audit record cannot be written fails. The database, not a comment, enforces append-only. [N1, N2, N3]
Checked by, to build: `integration-test:audit-export-complete`, `integration-test:audit-write-failure-fails-request`, `migration-test:audit-append-only`.

## Clinical safety

### P-11 No unvalidated clinical logic
Triage and any other clinical decision logic ships only after it is evaluated against a golden set a clinician signed, by a harness that calls the production code, against stated thresholds. The set covers negation and unmatched input, and unmatched input is never treated as non-urgent by default. [C5, C6, N5]
Checked by: kit checks CK-AI-EVAL and CK-AI-PROD-PATH.

### P-12 A clinician decides
The system proposes; a clinician decides. No triage level, order or message to a patient takes effect without a clinician's action, and the safety case says how that is guaranteed. [C5]
Human-judged at G3 by the Solutions Architect and the AI Engineer. Kit check CK-AI-SAFETY-CASE requires that a safety case exists and that a named person accepted it; it does not judge the case.

### P-13 Retrieved text is data
Text retrieved from an index is kept apart from instructions and never reaches the classifier as input it can act on. Each index records its sources and its refresh. [C5]
Checked by: kit check CK-AI-RETRIEVAL.

### P-14 Models are versioned and bounded
Every model, prompt, tool and index has a version, and a change to one is a change that passes the gates. Each model has latency and cost budgets, a fallback, logging that leaves out PHI, and a kill switch.
Checked by: kit checks CK-AI-VERSION and CK-AI-RUNTIME.

## A truthful product

### P-15 No fabricated data in a production build
Every figure shown to a user or printed in a report comes from a recorded evaluation or from telemetry. Hardcoded metrics and demo data do not exist in a production build. [H4]
Checked by: kit check CK-METRIC-PROVENANCE; to build: `arch-test:no-demo-endpoints-in-production`.

## Delivery

### P-16 A gate that fails stops the change
No `continue-on-error`, `|| true`, skipped test, disabled lint rule or suppressed advisory exists without a waiver that has an owner, a reason and an expiry. Waivers are reviewed before they expire. [H6, M3, M5, N10]
Checked by: kit checks CK-WAIVER and CK-ENFORCE-SETUP.

### P-17 Everything is pinned and accounted for
Actions are pinned to a commit, images to a digest, dependencies to a version. A release has a bill of materials and every licence in it is allowed. [H6, N8, M5]
Checked by: kit checks CK-PIN and CK-SBOM.

### P-18 Migrations are made for the engine that runs them
Migrations are written for, and applied on, the engine production runs. No migration warning is suppressed. A breaking or destructive change is declared and has a plan with a tested way back. [H5]
Checked by: kit checks CK-MIGRATION-ENGINE, CK-MIGRATION-DRIFT, CK-DATA-PLAN and CK-DATA-CLASS.

### P-19 Test and production run the same stores
Every data store runs the same engine in test and in production, and every difference between environments is written down. [H5]
Checked by: kit check CK-ENV-PARITY.

### P-20 Contracts and shared components change compatibly
A contract or shared component changes compatibly, or with a new version, a deprecation date and every consumer tested against it. Every event topic has a publisher and a name that can be read from the source. [N9]
Checked by: kit checks CK-CONTRACT-BREAK, CK-CONTRACT-VERSION, CK-CONTRACT-CONSUMER, CK-SHARED-SEMVER, CK-CONSUMER-MATRIX and CK-DEPRECATION; to build: `arch-test:event-topics-are-literal`.

## Engineering standards

### P-21 Every requirement is traced to a passing test
Each requirement has a criterion, each criterion a test, and the kinds of test follow the change's tier. Code that existed before a spec changes it is pinned down by characterization tests first.
Checked by: kit checks CK-TRACE, CK-TEST-STRATEGY and CK-CHARACTERIZATION.

### P-22 Changed code is covered
Lines changed by a spec are covered by tests at no less than 80 percent for High and Critical tiers.
Checked by, to build: `ci:changed-line-coverage`.

### P-23 Failures are visible
No catch-all hides an error, no task is started and discarded, and nothing blocks on an asynchronous call at startup. [M1]
Checked by, to build: `lint:error-handling`.

### P-24 The repository holds source that can be reviewed
Generated files and reports are not tracked. Values that belong to one environment are not in source. The licence statements agree. A source file over 600 lines is split or has a recorded reason. [M2, M4, N7]
Checked by, to build: `ci:repository-hygiene`.

## How this system is changed

### P-25 Agents draft, build and verify; a named person approves
Nothing passes a gate on an agent's say-so. Every gate decision is a review by a person entitled to make it, bound to the evidence they saw, and the agent that wrote something never verifies it.
Checked by: kit checks CK-APPROVER, CK-GATE-RECORD and CK-AUTHOR-NEQ-VERIFIER.

## Amendments

### Version 2, 2026-11-22
P-7 said PHI is redacted "before it reaches a model provider, a log or a browser". Read literally, that forbids showing a patient's record to their clinician. The words "or a browser" were an agent's mistake and are removed. The next sentences of P-7, on browser storage, are unchanged and say what finding H1 needs. No check changed. The report is `.specify/agentic/constitution/amendment-v2.md`.
