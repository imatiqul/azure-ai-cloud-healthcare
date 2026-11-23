---
spec: 009-phi-protection
finding: H1
tier_declared: critical
owner_role: security-compliance
principles: [P-7]
touches: [lib-infrastructure, lib-service-defaults, agent-service, shell, encounters-mfe]
depends_on:
  nodes: [azure-openai]
  specs: [001-fail-closed-auth, 003-identity-from-token, 004-audit-identity, 005-triage-validation, 008-audit-append-only, 015-audit-write-durable, 016-audit-record-content]
---
# Feature Specification: PHI is redacted at the boundaries, encrypted in the field, and kept out of browser storage

- **Phase and date:** Phase 5, batch 2, 2026-11-22. G1 and G2 approved by the owner on 2026-11-22, in chat ("Batch 2, waiting on you: go ahead"). No kit decision record exists yet; that needs a pull-request review
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 to A3 under "Decided at G2". The finding is rated High; the tier here is Critical because the change touches Critical components
- **Unverified:** nothing was built or run; the evidence is from reading files in Phase 1 and a file search on 2026-11-22

## Finding
H1, confirmed in Phase 1. Redaction is done by two regular-expression redactors, and call sites switch it on only when the `HealthQ:PhiRedaction` flag is set. `PhiEncryptedString` is used nowhere outside its own file. The browser keeps recent patient identifiers and the last 50 chat messages in `localStorage`.
Evidence: `src/HealthQCopilot.Infrastructure/AI/RegexPhiRedactor.cs`; `frontend/apps/shell/src/components/PatientQuickSearch.tsx:81`; `frontend/apps/shell/src/components/CopilotChat.tsx:21`. A search on 2026-11-22 finds the flag in the agent service, the infrastructure library and the service defaults, and `localStorage` in 33 files of the shell and one of the encounters app.

## User Stories
- As a patient, I want my identifiers taken out of text before it goes to a model provider or a log, so that they are not held where I have not agreed.
- As a security officer, I want protection that cannot be switched off by a flag, so that a configuration change cannot disclose PHI.
- As a clinician on a shared workstation, I want nothing about my patients left in the browser after I sign out.

## Requirements
- **FR-001**: Text sent to a model provider MUST have patient identifiers removed before it leaves the service.
- **FR-002**: Redaction MUST apply whatever the value of any feature flag.
- **FR-003**: The redactor MUST meet the recall threshold in its evaluation plan on a labelled set of synthetic clinical text.
- **FR-004**: A log entry MUST contain no patient identifier in clear text.
- **FR-005**: Each stored field that the data classification marks as PHI MUST be encrypted at field level.
- **FR-006**: The browser MUST NOT keep a patient identifier in local or session storage.
- **FR-007**: The browser MUST NOT keep conversation content in local or session storage.
- **FR-008**: The build MUST fail when browser code writes a value of a PHI type to local or session storage.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a prompt that contains a synthetic patient name, record number and date of birth, When the service calls the model provider, Then the captured outbound request contains none of them.
- **AC-002** (verifies FR-002) (abuse case): Given the `HealthQ:PhiRedaction` flag set to off, When the same call is made, Then the outbound request is redacted all the same.
- **AC-003** (verifies FR-003): Given the labelled set and the threshold in the evaluation plan, When the redactor is evaluated in the pipeline, Then recall is at or above the threshold, and the result is recorded with the redactor's version.
- **AC-004** (verifies FR-004): Given a request that fails while handling a synthetic patient, When the logs of the test run are searched for that patient's identifiers, Then none is found.
- **AC-005** (verifies FR-005): Given a migrated test database, When a field marked as PHI is read with a plain SQL client, Then the stored value is ciphertext.
- **AC-006** (verifies FR-006) (abuse case): Given a clinician who has searched for three patients, When local and session storage are read after sign-out, Then no patient identifier is in them.
- **AC-007** (verifies FR-007): Given a chat of several messages, When the page is reloaded, Then the messages come from the server and local and session storage hold none of them.
- **AC-008** (verifies FR-008): Given a change that stores a patient identifier in `localStorage`, When the frontend build runs, Then it fails and names the file.

## Non-Functional Requirements
- **NFR-001**: Redaction adds no more latency to a model call than the evaluation plan states, measured in the evaluation.
- **NFR-002**: Field encryption uses keys held in the key vault; no key is in source or configuration files.

## Risks
- Regular expressions miss names and free-text identifiers. FR-003 makes the miss rate visible; it may show that the current redactors are not enough.
- Encrypting fields that are queried or indexed changes how they can be searched. The plan lists each such field and how it is looked up afterwards.
- Encrypting existing data is a data change: it needs a data-change plan with a tested way back.
- Removing browser storage changes how the shell restores recent patients and chats; that state has to come from the server.

## Out of Scope
- Who may see a patient's record (002). What the audit record holds (016). The triage classifier's inputs (005).

## Decided at G2
The owner approved G2 on 2026-11-22 ("Batch 2, waiting on you: go ahead"). Each item stands as written.
- A1 (accepted): the fields to encrypt are those the data classification marks as PHI; the plan lists them by name for the Data Owner to confirm.
- A2 (accepted): the recall threshold for redaction is set in the evaluation plan at G3 by Security and Compliance, not here.
- A3 (accepted): nothing about a patient or a conversation may be kept in the browser between sessions, not even encrypted.

## PHI Involved
Patient identifiers and free text in prompts, logs and stored fields; patient identifiers and chat content in the browser.

## Access Control
No change to who may read a record. Keys for field encryption are readable only by the services that need them.

## Audit Controls
Use of the encryption keys is recorded by the key vault. Redaction evaluation results are kept with the redactor's version.

## Integrity
Encrypted fields are authenticated, so a changed ciphertext is detected when it is read.

## Authentication
Not applicable: no identity changes.

## Transmission Security
Text that leaves for a model provider is redacted first (FR-001). The channel itself is unchanged.

## Minimum Necessary
This spec is a minimum-necessary control: a model provider, a log and a browser's storage each receive less than they do today.
