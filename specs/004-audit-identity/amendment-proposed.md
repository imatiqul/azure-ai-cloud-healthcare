# Proposed amendment: 004-audit-identity

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository, branch `sdd/004-audit-identity` on `main` at `8d04df3`
- **Requirement IDs exercised:** GOV-17, GOV-18
- **Assumptions:** none. Every change below is a proposal; `spec.md` has not been edited
- **Unverified:** which gates each change re-opens is the kit's rule (G1 and G2 for a change to the spec's text), not something a run has shown, because no decision record exists yet for this spec

The owner approved this spec at G1 and G2 in conversation. Building it and having it reviewed by two agents that had not written it showed seven places where the approved text is wrong, says more than the code can do, or leaves a decision open. An agent does not edit an approved spec. Each item below gives the text as it is, the text proposed, why, and what stays blocked until it is decided.

Finding numbers: `S-` is the security review (`reviews/G5-security.md`), `V-` the independent verification (`verification/G6-report.md`).

## 1. The audit event stream is touched, not only depended on (V-1)

- **Now** (front matter): `touches: [lib-infrastructure, identity-service, ...]`, with `event-hubs-audit` under `depends_on`.
- **Proposed:** add `event-hubs-audit` to `touches`.
- **Why:** the changed middleware is the code that writes to the stream, the system map indexes that file to the stream, and the change alters the user in every event. The kit's CK-TOUCH fails on the change for this reason.
- **Blocked until decided:** CK-TOUCH; the impact report, which was computed without the node.

## 2. AC-004 and AC-005 are abuse cases (S-1, V-12)

- **Now:** `- **AC-004** (verifies FR-003): ...` and `- **AC-005** (verifies FR-004): ...`
- **Proposed:** `- **AC-004** (verifies FR-003) (abuse case): ...` and `- **AC-005** (verifies FR-004) (abuse case): ...`. The wording of each criterion stays.
- **Why:** the threat model's second and third threats are tested by these two criteria. Each describes someone trying to leave no trace, or a release that undoes the fix.
- **Blocked until decided:** CK-THREAT-MODEL.

## 3. FR-003 says more than the nine services can do (S-2)

- **Now:** "A request to an audited path that is refused for lack of a valid token MUST still produce an audit record, marked as unauthenticated."
- **The fact:** in production a caller with no token is refused by the gateway, which authenticates first and writes no audit record. The gateway is not among the components this spec touches. Inside the services, only the OCR routes under an audited prefix have a guard, so a service refuses such a request almost nowhere.
- **Proposed, one of two:**
  - (a) Narrow it: "A request to an audited path that one of the nine services refuses for lack of a valid token MUST still produce an audit record, marked as unauthenticated." Add to "Out of Scope": refusals made by the gateway, as a new finding with its own spec. Recommended, because the gateway has no audit store and giving it one is a design of its own.
  - (b) Widen the spec: add the gateway to `touches`, and a requirement and a criterion for a refusal at the gateway.
- **Blocked until decided:** the threat model can only say that its second threat is mitigated in part.

## 4. "Each record of access to PHI" is each record on an audited path (S-15, V-6)

- **Now** ("Audit Controls"): "After it, each record of access to PHI names the authenticated person, and refused attempts are recorded."
- **Proposed:** "After it, each record written for an audited path names the authenticated person, and a request that a service refuses on such a path is recorded. Routes that hold patient data and are not on the audited list leave no record; this spec does not change the list."
- **Now** (AC-002): "... through any of the nine services ..."
- **Proposed:** "... through any of the services that serve an audited path ...". The notification service serves none, so it writes no record before or after the change.
- **Why:** the middleware audits twelve path prefixes. The reviews list routes with patient data outside them: population health, break-glass, consent, registration, the streamed chat, the bff's GraphQL endpoint, the HL7 listener.
- **Blocked until decided:** nothing in the kit. The sentence is untrue as it stands.

## 5. Which identifier accounts for a person (S-7). Decision A1

- **Now** (A1, accepted): "the user identifier is the token's subject claim."
- **The fact:** by the security review, a subject issued by Entra ID is specific to one application registration and cannot be looked up in the directory; the object id, with the tenant id, can. The account table that could resolve a subject is written from request bodies on endpoints with no guard.
- **Choices:** keep the subject, and make resolving it to a person a requirement of spec 002 or 003; or record the object id and the tenant id in place of the subject (changes A1 and this change's code and tests); or record them beside the subject (changes the record's shape, which FR-005 forbids, so it needs the data-change plan the spec describes).
- **Blocked until decided:** nothing in the kit. The change as built follows A1.

## 6. Whether the logs carry the identifier (S-3, S-4)

- **Now:** the spec says nothing about logs. The middleware's log lines carried a user before the change, the same word for everyone; they now carry the identifier beside the path, and go to the telemetry store when one is configured.
- **Choices:** keep it, and treat the telemetry store as a store of audit data with named readers and a retention period; or take the user off every log line.
- **Blocked until decided:** nothing in the kit. The corrected privacy impact names the logs as a store.

## 7. The order the spec fixes is no longer what makes the record right (the plan, "For the reviewer")

- **Now:** FR-001, AC-001 and AC-005 require the audit middleware after authentication.
- **The fact:** the middleware now reads the identity after the rest of the pipeline has run. A test shows a service in the old order naming the caller too. Sitting behind authentication, the audit no longer sees a request that authentication itself fails with an error, or one that a middleware in front of authentication answers.
- **Choices:** keep the order as approved (the change as built); or require the audit in front of everything that can answer a request, and keep the test that the identity is read afterwards.
- **Blocked until decided:** nothing in the kit.
