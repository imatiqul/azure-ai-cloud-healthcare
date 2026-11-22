# Security and compliance review: 004-audit-identity

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository, branch `sdd/004-audit-identity`, code change `769efd4..HEAD`, base `8d04df3`
- **Requirement IDs exercised:** AGT-6, QLT-5
- **Assumptions:**
  1. The identity provider is Microsoft Entra ID through Microsoft.Identity.Web 3.8.2 on .NET 10 (`src/HealthQCopilot.Infrastructure/Auth/JwtBearerExtensions.cs:37-38`), with the default mapping of token claims left on. The role policies need that mapping (`JwtBearerExtensions.cs:41-51`), so a token's `sub` reaches the code as the name-identifier claim.
  2. Production is the topology the privacy impact describes: callers reach the services through the gateway. The audit tables are on PostgreSQL there, so column lengths are enforced.
  3. What I say about Entra's `sub` and `oid` claims comes from Microsoft's published description of its identity platform, not from this repository.
  4. Gate G3 approved the plan with its decisions P1 to P3. I review against the spec's requirements, the constitution and the threat model, and I say where I think a decision should be reopened.
  5. Severity. "Must-fix before the gate": without it the gate passes on a failing check or on a statement that is not true, or a requirement of this spec is unmet. "Should-fix": a real weakness that is older than this change or cannot be used today; fix it here if the owner allows the scope, otherwise give it to a named spec before release. "Note": for the record.
- **Unverified:** nothing was built or run. Every statement about behaviour comes from reading the code at HEAD (`03c9f5b`). In particular I could not verify:
  - that the tests compile and pass;
  - whether any workflow runs the unit tests. `.github/` is not on my reading list; the plan says none has run since May 2026 (`plan.md:78-79`);
  - deployment configuration outside `src/` (Helm, Bicep, Key Vault, API Management): whether each of the nine services is given an identity provider in production, and whether anything in front of the gateway records refused requests;
  - under which claim type the real bearer handler delivers the subject, and which of two `UserId` attributes a log store keeps (S-4);
  - that PostgreSQL refuses the over-long path in S-11, and that an interrupted export throws as S-5 describes. Both follow from the code and from the framework's documented behaviour; neither was run;
  - readers outside `src/` and `tests/`: the web front end, consumers of the audit event stream, saved log queries;
  - `tasks.md`, `test-strategy.yml`, `trace-manifest.json`, `origin.yml` and `briefs/` in the spec folder are not on my reading list and I did not read them. I read no excluded folder and no commit message.

## What I read

- My role: `.specify/agentic/agents/security-reviewer.yml`.
- The spec's documents: `spec.md`, `plan.md`, `impact.md`, `threat-model.yml`, `privacy-impact.md`, `rollout.yml`. Also `.specify/memory/constitution.md` and `system-map/map.yml` (the audit table, the audit event stream, the identity provider, and their edges).
- The change: `git diff 769efd4 HEAD -- src tests` (14 files), each changed file in full, and the middleware as it was at `8d04df3`. `git diff 8d04df3 769efd4 -- src tests` is empty, so the base and the start of the change hold the same code. No file under a `Migrations` folder and no line of `AuditDbContext.cs` is in the change.
- To follow threats through the code, under `src/`:
  - `HealthQCopilot.Infrastructure`: `Auth/JwtBearerExtensions.cs`; `Middleware/` (tenant context, idempotency, security headers, rate limiting); `Persistence/AuditDbContext.cs` and `DatabaseExtensions.cs`; `Messaging/` (the audit event and its publisher); `Observability/`;
  - `HealthQCopilot.ServiceDefaults/Extensions.cs` (logging and log scopes);
  - `HealthQCopilot.Fhir`: `Middleware/ConsentEnforcementMiddleware.cs`, `Endpoints/FhirBulkExportEndpoints.cs`;
  - `HealthQCopilot.Identity`: `Endpoints/AuditExportEndpoints.cs`, `Endpoints/IdentityEndpoints.cs`, `Persistence/IdentityDbContext.cs`, `Validators/IdentityValidators.cs`;
  - `HealthQCopilot.Gateway`: `Program.cs` and its `appsettings*.json`;
  - `HealthQCopilot.BFF`: `Program.cs`, `Services/DownstreamApiClients.cs`;
  - the top-level keys of every service's `appsettings*.json`;
  - searches of `src/` and `tests/` for other authentication schemes, assignments to the request's user, claims transformations, exception handlers, authorization guards, readers of the audit table and uses of the old placeholder.
- Kit checks, run as allowed: `CK-THREAT-MODEL` fails (S-1); `CK-PRIVACY-IMPACT` passes.
- No file held instructions addressed to a reviewing agent. The plan's section "For the reviewer at G3" is addressed to a person; I read it as the author's statement.
- I found no password, key or token literal in the 14 changed files. The strings in `PhiAuditPipelineTests.cs:119` and `:165` are inputs to a test scheme, not credentials. Test data is synthetic.

## Findings

Fifteen findings: three must-fix, nine should-fix, three notes. None of the three must-fix findings is in the code of T001 to T004; they are in the spec's documents.

**What holds, by reading.**
- The middleware reads no header. With an identity provider configured, the user in the row and in the event is the subject of the token the service validated (`PhiAuditMiddleware.cs:87, 105-112, 120-129`). I found no way for a caller to choose it: nothing under `src/` assigns the request's user, adds an identity to it, transforms claims, or names a scheme on a policy.
- All nine pipelines run authentication, then the audit, then authorization. In the agent service the audit stays outside the idempotency middleware (`src/HealthQCopilot.Agents/Program.cs:391-396`). In the FHIR service the consent middleware stays before authentication (`src/HealthQCopilot.Fhir/Program.cs:84-88`).
- The set of requests that leave a row and an event is the same as before the change, in all nine services, in both directions. Nothing that answers a request sits between the audit's old place and its new one: bearer authentication does not answer requests, and the consent middleware passes every request through while it runs before authentication (`ConsentEnforcementMiddleware.cs:55-63`).
- The record's shape is unchanged and no migration is touched (FR-005). No database round trip is added (NFR-001).

**The short answers.**
- *Name someone else:* not in the row or the event. Yes in the log scope (S-4), and yes when the identifier is resolved to a person (S-7).
- *Name nobody:* yes where the service has no identity provider, and then it names a made-up user (S-6); yes for every call that comes through the BFF or from another service (S-3).
- *Skipped:* a request refused at the gateway (S-2); a request that ends in an exception or is cut off (S-5); a write the caller makes fail (S-11); any path not on the audited list (S-15).

### S-1. The kit's threat-model check fails

- **Severity:** must-fix before the gate
- **Belongs to:** `spec.md` and `threat-model.yml` (not T001 to T004)
- **What is wrong:** `CK-THREAT-MODEL` fails at HEAD with two messages: "AC-004 tests threat TH-2 but is not written as an abuse case in the spec", and the same for AC-005 and TH-3.
- **Where:** `threat-model.yml:11-20`; `spec.md:40-41` (only AC-003, line 39, is marked as an abuse case).
- **How it is met:** anyone who reruns the kit at the gate sees a failing check behind the change. P-16 says a gate that fails stops the change.
- **What must change:** the owner approves an amendment that writes AC-004 and AC-005 as abuse cases, or gives TH-2 and TH-3 criteria that are, and the check passes. The comment in `threat-model.yml:3-4` reports the failure; reporting it does not resolve it, and a waiver would not either.

### S-2. A caller with no token is refused at the gateway, where nothing is audited

- **Severity:** must-fix before the gate
- **Belongs to:** `threat-model.yml` (TH-2) and `spec.md` (FR-003, "Audit Controls"). The code that would close it is in the gateway, outside this change.
- **What is wrong:** TH-2 is recorded as mitigated by FR-003 and tested by AC-004. That holds only where a service refuses the request. In production the gateway authenticates first and refuses first, and the gateway has no audit middleware and no audit table. Inside the nine services, the only routes under an audited prefix that have a guard are the OCR ones. Every other audited route has none (finding C2), so a service never answers 401 there.
- **Where:** `src/HealthQCopilot.Gateway/Program.cs:33-49` (`MapReverseProxy().RequireAuthorization()`, no `PhiAuditMiddleware`); `src/HealthQCopilot.Gateway/appsettings.Production.json` (an identity provider is configured); `src/HealthQCopilot.Gateway/appsettings.json:9-83` (every audited prefix that a service serves is routed through it); `src/HealthQCopilot.Ocr/Endpoints/OcrEndpoints.cs:13-16` (the one guarded group under an audited prefix).
- **How it is met:** someone outside sends requests with no token to `/api/v1/fhir/...`. The gateway answers 401. No row and no event exists in any store; the gateway's ordinary request log, if it is kept, is the only trace. That is the threat exactly as TH-2 words it. A privacy officer asked whether a record was probed has nothing to read.
- **What must change:** the threat model says that TH-2 is mitigated for refusals made by a service and is open at the gateway. The open part gets an owner and a decision: an audit of refused requests to audited prefixes at the gateway, as an amendment or a new spec. Until then FR-003 and the sentence "refused attempts are recorded" (`spec.md:68`) are narrowed, by amendment, to what the code does.

### S-3. The privacy impact is wrong about the path, the stores and the readers

- **Severity:** must-fix before the gate
- **Belongs to:** `privacy-impact.md` (not T001 to T004). Point 3 can be settled in T001 instead.
- **What is wrong:**
  1. *Lineage.* The document says a request reaches a service "through the bff and then the gateway's routes". The BFF calls six services at their own addresses (the defaults are the service names, not the gateway) and sends no `Authorization` header. A read of patient data through GraphQL reaches the service with no token and is recorded as `(unauthenticated)`, or as `demo-user`, never as the person. Calls from one service to another are the same (identity to FHIR; FHIR to identity and to revenue).
  2. *"The service authenticates it."* Only where the service has an identity provider configured. Under `src/` none of the nine has one: the `AzureAd` section exists in the gateway's production settings and, with an empty client id, in the identity service's settings. Without it every request is the demo user (S-6).
  3. *Stores.* The document names the table and the event stream. The middleware also writes the same fields to the application log. `PHI_ACCESS` now carries the user identifier beside the path; before this change it said "anonymous". Where Event Hubs is not configured, the event itself is written as a log line with the user. Logs are exported, with their scopes, to the telemetry stores. Who can read those stores, and how long they keep data, is not stated.
  4. *Readers.* The policy named `PlatformAdmin` admits the role `Admin` as well. The export reads the identity service's table only, with no tenant filter, so it shows that service's accesses, not "each access". Readers of the telemetry store are not listed. Readers of the event stream are not in the repository or on the system map.
  5. *"Not a name."* `GET /api/v1/identity/users/by-external/{externalId}` has no guard and returns the display name and e-mail for an identifier. Inside the system the identifier is one request away from a name.
- **Where:** `privacy-impact.md:11-12, 17-18, 20-21`; `src/HealthQCopilot.BFF/Program.cs:11-39`; `src/HealthQCopilot.BFF/Services/DownstreamApiClients.cs:188-378`; `src/HealthQCopilot.Identity/Program.cs:41-46`; `src/HealthQCopilot.Fhir/Program.cs:61-73`; `JwtBearerExtensions.cs:26-34, 46-47`; `PhiAuditMiddleware.cs:79-81`; `src/HealthQCopilot.Infrastructure/Messaging/EventHubAuditService.cs:49-57`; `src/HealthQCopilot.ServiceDefaults/Extensions.cs:68-72`; `src/HealthQCopilot.Infrastructure/Observability/ObservabilityExtensions.cs:84-93`; `src/HealthQCopilot.Identity/Endpoints/AuditExportEndpoints.cs:23-25, 44-50`; `src/HealthQCopilot.Identity/Endpoints/IdentityEndpoints.cs:49-64`.
- **How it is met:** an approver signs a document that says where the new identifier goes and who can see it, and it is wrong on both. Someone with access to the log store can read which user touched which patient path.
- **What must change:** correct the five points. For point 3 there is a choice: the log lines stop carrying the user identifier, or the document names the telemetry store as a store of audit data, with its readers and its retention.

### S-4. The user on the audit's own log lines can be set by the caller

- **Severity:** should-fix
- **Belongs to:** T001 for the lines the audit middleware writes; finding C3 (spec 003) for the scope itself
- **What is wrong:** in eight services (all but Voice) the tenant-context middleware runs before authentication and opens a log scope whose `UserId` is the `X-User-Id` header, or "anonymous". Scopes are exported. Every log record of the request carries that value, including the audit middleware's own. `PHI_ACCESS_COMPLETE` and "Failed to persist PHI audit log entry" carry no user of their own, so the header's value is the only user on them. `PHI_ACCESS` and the `[AUDIT]` fallback line carry the true user and the header's value under the same attribute name. The gateway neither sets nor strips the header.
- **Where:** `src/HealthQCopilot.Infrastructure/Middleware/TenantContextMiddleware.cs:33-36, 48-53`; `src/HealthQCopilot.ServiceDefaults/Extensions.cs:71`; `PhiAuditMiddleware.cs:79-81, 97-99, 153`; `EventHubAuditService.cs:52-56`; `src/HealthQCopilot.Gateway/appsettings.json` (no header transform on any route).
- **How it is met:** a caller with a token for U sends `X-User-Id: V`. The row and the event name U. A query of the log store by `UserId`, which the middleware's own comment gives as its purpose (`TenantContextMiddleware.cs:7-10`), returns the request under V. If the row is lost (S-5, S-11), the trace that remains names V.
- **What must change:** in T001, the lines the audit middleware writes after the pipeline carry the resolved user, and the failure line also the method, the status and the correlation id, so that a lost row can be rebuilt without the scope. The threat model says that TH-1 is mitigated for the row and the event, not for the log. Until 003 is done, nobody uses the log's `UserId` attribute to account for an access.

### S-5. A request that ends in an exception leaves no record

- **Severity:** should-fix
- **Belongs to:** T001. Older than this change; no spec I was shown owns it.
- **What is wrong:** the row and the event are written after `await _next(context)`, with no `finally`. No service has an exception handler. If anything after the audit throws, nothing is written: the `PHI_ACCESS` line and the host's request log are the only traces. The change does not make this worse for the row or the event. One thing is new: if the authentication middleware itself throws, the audit, now behind it, no longer writes even the first line. I could not establish by reading whether the bearer handler throws when the provider's metadata cannot be fetched.
- **Where:** `PhiAuditMiddleware.cs:83-112`; no `UseExceptionHandler` anywhere under `src/`; a concrete case in `src/HealthQCopilot.Fhir/Endpoints/FhirBulkExportEndpoints.cs:24-158`.
- **How it is met:** the FHIR bulk export streams patient resources line by line. It fetches pages from the FHIR server and writes each line with the request's cancellation token. The caller reads as much as they want and drops the connection; the next page fetch or write is cancelled and throws. Resources have left the service and there is no row and no event. The same happens if the FHIR server fails part-way. The export group has no guard either (C2).
- **What must change:** the record is written in a `finally`, with the status as far as it is known and a mark that the request did not complete. The plan says nothing else in the file changes, so this needs the owner's amendment. If it is not taken here, it goes by name into the spec that owns lost records (N3, spec 015), and the threat model lists it.

### S-6. Without an identity provider the audit records a made-up user as a person

- **Severity:** should-fix
- **Belongs to:** T001, and the release order; the cause is finding C1 (spec 001)
- **What is wrong:** with no identity provider configured, the demo handler authenticates every request as `demo-user` with every role. The audit records `demo-user` as it records a person: authenticated, with a subject, no marker. Under `src/` that is the configuration of all nine services (S-3, point 2). With it, after this change every row in every table says `demo-user`, including for requests with no credentials. `(unauthenticated)` never appears and nothing is refused, so AC-002 and AC-004 cannot be observed.
- **Where:** `JwtBearerExtensions.cs:26-34, 71-86`; `PhiAuditMiddleware.cs:120-129`; the nine services' `appsettings*.json`.
- **How it is met:** an auditor reads a trail in which one user made every access. "anonymous" said that nobody was named; `demo-user` reads like a name.
- **What must change:** (a) 004 is not released as closing C4 before 001 is released and each service that serves an audited route is shown, in staging, to write rows with real subjects. (b) The audit does not present the demo identity as a person; the owner decides whether that is a marker in the middleware or a bracketed subject in the handler. (c) The rollout watches for it (S-12).

### S-7. The identifier cannot be resolved to a person in a way that can be trusted

- **Severity:** should-fix; a decision for the owner before release
- **Belongs to:** decisions A1 (spec) and P1 (plan), carried out in T001. The user table is outside this change.
- **What is wrong:** P1 gives one reason for recording `sub`: the identity service reads the same claim, "so an audit record can be joined to a user account". The join does not hold.
  1. Nothing writes the token's subject into the account. `ExternalId` comes from a request body, on `POST /api/v1/identity/users` and on the public patient registration, both without a guard. The registration's comment says the caller supplies the Entra object id, which is a different value from the subject.
  2. So the table can say anything. A caller can register their own subject under another person's name. A caller can register an account whose external id is `(unauthenticated)` or `(no-subject)`: the validator asks only for a non-empty string of at most 256 characters.
  3. By Microsoft's description, the Entra subject is specific to one application registration and cannot be looked up in the directory. The object id is the same across applications and can be. If the nine services do not all validate the same audience, one person has a different subject in each service's table.
  4. The audit column holds 128 characters; the account's external id holds 256.
- **Where:** `plan.md:44`; `IdentityEndpoints.cs:15-29, 132-137, 152-181`; `src/HealthQCopilot.Identity/Validators/IdentityValidators.cs:10, 21`; `src/HealthQCopilot.Identity/Persistence/IdentityDbContext.cs:24, 29`; `src/HealthQCopilot.Infrastructure/Persistence/AuditDbContext.cs:20`; `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs:202-218` (pins that the object id is never used).
- **How it is met:** the privacy officer holds a row with an opaque subject. The directory cannot resolve it. The application's table resolves it to whatever name was registered first.
- **What must change:** the owner decides one of two. Record the directory object id, with the tenant id, in place of the subject or beside it; beside it is a change of shape and needs the amendment the spec describes. Or keep the subject and make the account's external id come from the validated token only, on guarded endpoints (findings C2 and C3). Until one is done, the plan does not claim the join, and the way a recorded identifier is resolved to a person is written down and tested.

### S-8. `ResolveUserId` checks one identity and reads the subject from any

- **Severity:** should-fix
- **Belongs to:** T001, with tests in T003
- **What is wrong:** the method asks whether the principal's primary identity is authenticated, then takes `sub` from any identity on the principal. With two identities the two answers can come from different ones. A `sub` on an unauthenticated identity can name the user. An authenticated identity that stands behind an unauthenticated first one is recorded as `(unauthenticated)`. Nothing under `src/` creates a second identity today, so I see no way to use this now. A related limit: where a policy names schemes and none of them authenticates, the framework replaces the user with an empty one, so that refusal is recorded as `(unauthenticated)` even if the default scheme had authenticated the caller.
- **Where:** `PhiAuditMiddleware.cs:122, 125-126`.
- **How it is met:** the first change that adds an identity to the principal (a second scheme, a claims transformation, an identity built from headers) changes who the audit names, and no test fails.
- **What must change:** the subject is taken from an authenticated identity only, and tests cover a principal with two identities, in both orders. This is new code and a small change; it should be made in this change.

### S-9. What the tests do not prove

- **Severity:** should-fix
- **Belongs to:** T003
- **What is wrong:**
  1. No test asserts the user in the event. `PhiPath_PublishesToEventHubWhenPresent` accepts any event, and the pipeline tests register no publisher.
  2. No test of a 403: a signed-in caller refused by a policy and recorded under their own subject. That is the record that shows an insider trying a door.
  3. The tests for AC-003 run without the tenant-context middleware, the only code in the product that reads `X-User-Id`. They prove that the audit middleware ignores the header. They would also pass if the header still decided the user somewhere else, which it does (S-4).
  4. AC-002 says "through any of the nine services". No test sends a request through a service's own pipeline with the real bearer handler; the proof is a synthetic pipeline plus a check of each `Program.cs` as text. For the notification service the criterion cannot hold at all: it serves no audited route, so no record is written there (S-15). P-9 names `integration-test:audit-attribution` as the check the spec for C4 must add. It is not added, so by the constitution's own rule P-9 is still stated, not enforced.
  5. The tests wait a fixed 150 ms, or poll, for a write that is not awaited. Under load they can fail without a defect.
- **Where:** `PhiAuditMiddlewareTests.cs:81-86, 313-326`; `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditPipelineTests.cs:38-64, 96-110, 131-146`; `.specify/memory/constitution.md:55-57`.
- **How it is met:** a later change passes the wrong identity to the event, or breaks attribution in one service's real pipeline, and every test stays green.
- **What must change:** add tests for points 1, 2 and 3. For point 4, add a test through a service host with a signed test token. If the owner prefers, the staging stage instead checks for a row with a real subject from each service that serves an audited route, and the plan says that P-9's check is not built by this spec. AC-002 is amended to say eight services, or the notification service's routes are added to the audited list.

### S-10. The order check does not look in front of authentication

- **Severity:** should-fix
- **Belongs to:** T004. Point 4 is outside this change.
- **What is wrong:**
  1. The check's message says "nothing that can answer a request may sit in front of the audit". It looks only at lines that begin `app.Use` between authentication and the audit. Anything before authentication is not looked at; `app.Map…` and `app.Run(…)` between the two are not either. The FHIR consent middleware sits before authentication and can answer 403 by its own code. It does not today only because it sees no user there. A rate limiter or an output cache moved in front of authentication would also pass.
  2. A registration inside a block comment, an `#if` or an `if` block counts as registered.
  3. A service that serves patient data and never registers the audit passes. The gateway and the BFF are two today.
  4. By the plan, no workflow runs this test project, so FR-004 ("the build MUST fail") is not in operation. I could not read the workflows.
- **Where:** `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrder.cs:21-23, 36-42, 52-65`; `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrderTests.cs:13-17, 36-49`; `ConsentEnforcementMiddleware.cs:55-80`; `src/HealthQCopilot.Fhir/Program.cs:84-88`; `plan.md:78-79`.
- **How it is met:** the consent middleware is changed so that it sees the user while it still sits before authentication. It starts refusing, outside the audit, and the build stays green. Before this change the audit was outside it and would have recorded the refusal.
- **What must change:** the check covers what precedes the audit: a list of the middleware that may sit there, with the consent middleware on it as an exception with its reason, so that it has to be looked at when it changes. Points 2 and 3 are for the record. Point 4 needs an owner: until a workflow runs the unit tests on every pull request, TH-3 is not mitigated in practice.

### S-11. A caller can make the audit write fail

- **Severity:** should-fix
- **Belongs to:** outside this change (finding N3, spec 015); listed because the caller can do it at will
- **What is wrong:** the write is not awaited and a failure is only logged. A caller can cause the failure. The path column holds 512 characters and the path is the caller's. Route values typed as a GUID or a number accept padding, so a request whose decoded path is longer than 512 characters can still be served. On PostgreSQL the insert is then refused, the failure is swallowed, and the response has already gone. The method column (10 characters) and the user column (128) have limits too. This is by reading; it was not run.
- **Where:** `AuditDbContext.cs:20-22`; `src/HealthQCopilot.Infrastructure/Persistence/DatabaseExtensions.cs:106-114`; `PhiAuditMiddleware.cs:105-106, 151-154`; for example `src/HealthQCopilot.Voice/Endpoints/VoiceEndpoints.cs:68`.
- **How it is met:** a signed-in caller reads a record through a padded path. The table has no row for it. The event, where Event Hubs is configured, and the log lines remain.
- **What must change:** the spec that owns N3 covers failures a caller can cause, not only outages, and tests them on PostgreSQL. Until then a path longer than the column is cut to fit, with a mark, before the write. This spec's threat model lists the threat.

### S-12. The rollout's halt signals miss the likely failures

- **Severity:** should-fix
- **Belongs to:** `rollout.yml` (not T001 to T004)
- **What is wrong:**
  1. No signal for rows that say `demo-user` in production (S-6), or `(no-subject)`.
  2. No signal for the error "Failed to persist PHI audit log entry".
  3. The third signal needs the list of guarded paths, and there is none. Under the audited prefixes only the OCR routes have a guard; calls from the BFF and from other services arrive with no token; `/fhir/metadata` is open by design. Rows that say `(unauthenticated)` with a status below 400 will exist on other paths from the first minute.
  4. Rows written before the release say "anonymous" and stay so. The time each service changed over is recorded nowhere, so a reader cannot tell which rows to trust.
- **Where:** `rollout.yml:12-15`; `src/HealthQCopilot.Gateway/appsettings.json:45-51`.
- **How it is met:** the release goes out, every signal is quiet, and every row says `demo-user`.
- **What must change:** add signals 1 and 2; give signal 3 its list of paths; record the change-over time of each service with the release.

### S-13. Readers of the audit data

- **Severity:** note
- **Belongs to:** outside this change (`AuditExportEndpoints.cs`, the event stream)
- **What is wrong:** nothing breaks. Five things change or stay weak.
  1. The summary returns the 100 largest user-and-method groups and does not say that it stopped there. With real users it is no longer the whole picture. The markers and `demo-user` appear in it as users. The plan states the first half of this.
  2. The CSV export quotes a value only for a comma, a quote or a new line. An Entra subject is text in the URL-safe base64 alphabet, which includes `-`. Where one begins with it, a spreadsheet reads the cell as a formula.
  3. Reading the export leaves no audit row: `/api/v1/admin/audit` is not an audited prefix. The export now shows who accessed what.
  4. The other events on the stream (agent decision, consent decision, redaction, dispatch) still carry no user, and the access event carries no session. The stream cannot be joined by user across event types.
  5. Nothing under `src/` or `tests/` filters audit data on "anonymous". Readers of the event stream are outside the repository, and the system map has no edge to or from `event-hubs-audit`, so I cannot say what they do with the new values.
- **Where:** `AuditExportEndpoints.cs:67-79, 120-123`; `src/HealthQCopilot.Infrastructure/Messaging/AuditEvent.cs:20-112`; `system-map/map.yml:277-284`.
- **How it is met:** a privacy officer takes the summary for the full list of users, or opens the CSV in a spreadsheet and sees an error where an identifier should be.
- **What must change:** the summary says when it is cut off; the export quotes every value. Both belong to the spec that owns the export (007).

### S-14. Smaller points in the middleware

- **Severity:** note
- **Belongs to:** T001
- **What is wrong:**
  1. The first log line names the user as it stood before the rest of the pipeline; the row names the user after it. They differ only if something downstream changes the user. Nothing does today.
  2. The class comment says rows are immutable by a database policy. The policy exists only as comments in `AuditDbContext.cs`; that is finding N2. The change edits this comment block and leaves the claim.
  3. Five words now mean "no person": `anonymous` (old rows), `(unauthenticated)`, `(no-subject)`, `demo-user`, and `anon` in the fallback log line for events without a user. They are not listed in one place for a reader of the export, and nothing stops an account being created with one of them as its external id (S-7).
  4. A request whose token has no subject is served and recorded as `(no-subject)` with a warning. With Entra it should not occur. With an Azure AD B2C user flow that has the subject claim switched off, a setting B2C's documentation describes, it would be every request; the identity service's settings carry a B2C section. Nothing alerts on the warning (S-12).
  5. The log redaction rewrites long runs of digits in log text and attributes, so an identifier that is mostly digits can be altered in a log line. The row and the event are not touched.
- **Where:** `PhiAuditMiddleware.cs:13-15, 81, 87-93`; `AuditDbContext.cs:31-34`; `EventHubAuditService.cs:55`; `src/HealthQCopilot.Infrastructure/Observability/PhiRedactionProcessor.cs:36-53`.
- **How it is met:** a reader of the code believes rows cannot be altered; a reader of the export does not know which values are not people.
- **What must change:** correct the comment when 008 is planned, or now; list the reserved values where the export is documented.

### S-15. The audited prefixes are not the list of routes that hold patient data

- **Severity:** note
- **Belongs to:** outside this change; the plan says the list does not change
- **What is wrong:** the audit runs for twelve prefixes.
  1. Routes that hold patient data outside them leave no record whoever calls them. Examples: `/api/v1/population-health/sdoh/{patientId}`, `/cost-prediction/{patientId}`, `/patients/{patientId}/hedis` and `/care-gaps`; `/api/v1/identity/break-glass`, `/api/v1/identity/consent` and `/api/v1/identity/patients/register`; the streamed chat at `/api/v1/agents/guide`; `/graphql` at the BFF; the HL7 v2 listener in the FHIR service.
  2. The notification service registers the audit and serves no route under any audited prefix. Its audit never runs for a route it serves, so one of the nine services writes no rows. The rollout's second halt signal can never apply to it.
  3. Three of the twelve prefixes (`/api/v1/patients`, `/api/v1/encounters`, `/api/v1/appointments`) match no route under `src/`. The tests use the first of them as their patient path.
  4. `/api/v1/agents/coding/code-encounter` is on the idempotency list and not on the audit list, so an answer replayed from that cache with no token is not audited at all.
- **Where:** `PhiAuditMiddleware.cs:36-50`; `src/HealthQCopilot.PopulationHealth/Endpoints/PopHealthEndpoints.cs:51, 135, 236, 317`; `src/HealthQCopilot.Identity/Endpoints/BreakGlassEndpoints.cs:27`; `src/HealthQCopilot.Identity/Endpoints/ConsentEndpoints.cs:23`; `IdentityEndpoints.cs:156`; `src/HealthQCopilot.Agents/Endpoints/GuideEndpoints.cs:15`; `src/HealthQCopilot.BFF/Program.cs:67`; `src/HealthQCopilot.Fhir/Program.cs:40-52`; `src/HealthQCopilot.Notifications/Endpoints/NotificationEndpoints.cs:14`; `PhiAuditPipelineTests.cs:28`; `src/HealthQCopilot.Infrastructure/Middleware/IdempotencyMiddleware.cs:36-45`.
- **How it is met:** the spec says "each record of access to PHI names the authenticated person" (`spec.md:68`). That is true of each record. It is not true of each access, and for the notification service there is no record to name anyone.
- **What must change:** the sentence in the spec is limited to the audited prefixes, and the list of prefixes is given to a spec. The wording of AC-002 is under S-9.

## The threat model

| Threat | Mitigated by the code | Tested by the criterion it names | Open |
|---|---|---|---|
| TH-1, header naming another user | Yes for the row and the event: the middleware reads no header (`PhiAuditMiddleware.cs:120-129`). No for the log scope. | AC-003: yes for the row, in a pipeline without the middleware that reads the header. The event is not asserted. | S-4, S-9 |
| TH-2, refused probes leave no record | Only for a refusal made by a service: the audit sits before authorization in all nine. Not at the gateway, where a caller with no token is refused. | AC-004: yes for a 401 from a service, in a synthetic pipeline. In the nine services that case exists only on the OCR routes. Not written as an abuse case. | S-1, S-2 |
| TH-3, the old order returns unnoticed | Twice in code: the order check, and the identity read after the pipeline, which makes a service in the old order still record the caller (`PhiAuditPipelineTests.cs:240-254`). Not in operation if no workflow runs the tests. | AC-005: yes, the check is applied to the old order and names the service (`RequestPipelineOrderTests.cs:51-63`). Not written as an abuse case. | S-1, S-10 |

On TH-3: since the identity is read after the pipeline, the order no longer decides who the row names. "Every record names nobody and nobody notices" can still happen in three other ways: the service runs the demo handler (S-6), the token is not forwarded (S-3), the write fails silently (S-11). A check at build time catches none of them. They need a signal at run time (S-12).

Threats the model misses:

1. Refusal at the gateway, with no record (S-2). Repudiation.
2. A request that ends in an exception or is cut off, with no record (S-5). Repudiation.
3. A write the caller makes fail (S-11), and flooding. A caller who reaches a service can produce rows, events and log lines without limit; each row is a database write that is not awaited (`PhiAuditMiddleware.cs:105-106`); the rate limiter sits after authorization and takes its key from a header the caller sets (`src/HealthQCopilot.Infrastructure/Middleware/RateLimitingExtensions.cs:85-89`). Repudiation and denial of service.
4. A made-up identity recorded as a person (S-6). Spoofing, by configuration.
5. The user in the log scope (S-4). Spoofing.
6. Resolving the identifier to a person through a table a caller can write (S-7). Spoofing.
7. Access with no user at all: calls from the BFF and between services (S-3). Repudiation.
8. Disclosure of the trail itself: the logs, the export to `Admin` across tenants, the unguarded lookup by external id (S-3). Information disclosure.
9. Routes that hold patient data and are not audited (S-15). Repudiation.
10. A principal with more than one identity (S-8). Spoofing; cannot be used today.
11. Alteration of rows (N2, spec 008). Out of scope by the spec; the model should say so instead of being silent.

## The privacy impact

- **Purpose:** accurate.
- **Minimum fields:** accurate for the row and the event. It leaves out the log lines: `PHI_ACCESS` now carries the identifier, and one log line is added (`PHI_ACCESS_NO_SUBJECT`, with the path and the correlation id).
- **Lineage:** not accurate. The BFF does not go through the gateway's routes and sends no token; "the service authenticates it" depends on configuration that is absent under `src/`; the log is a third store; "nothing else reads the record" cannot be shown for the event stream (S-3, points 1 to 3).
- **Retention:** accurate that nothing sets it. A comment in `AuditExportEndpoints.cs:14` says seven years and nothing enforces it. The retention of the log copies, which now hold the identifier, is not set either.
- **Access paths:** incomplete. The telemetry store is missing; the `PlatformAdmin` policy admits `Admin` (S-3, point 4).
- **Who can see what:** incomplete. Holders of `Admin`, and readers of the logs, also see the identifier with the path. The export covers the identity service's table only. The identifier is turned into a name by an unguarded endpoint (S-3, point 5). In demo mode every caller holds both roles.

`CK-PRIVACY-IMPACT` passes; it checks that the sections exist, not that they are right. The document must be corrected before a person approves on it (S-3).

## Residual risk

**In scope for this spec.** Real after the change unless the finding is fixed.

1. A caller with no token who is refused at the gateway leaves no record (S-2). The spec's requirement covers it by its wording; the code is in a node the spec does not touch.
2. The logs hold the user identifier with the path, in a store the privacy impact does not name, and the `UserId` attribute on them can be set by the caller (S-3, S-4).
3. A request that ends in an exception, including a bulk export cut off part-way, leaves no row and no event (S-5). No spec owns this yet.
4. The identifier in the row cannot be resolved to a person without a table that any caller can write (S-7).
5. The FHIR consent middleware is outside the audit. It refuses nothing today. When it is fixed to refuse, its refusals are not recorded unless the order changes again, and the order check will not notice (S-10).
6. Rows written before the release say "anonymous" for ever, and nothing records when each service changed over (S-12).
7. The criteria are proven in a synthetic pipeline. P-9's named check is not built (S-9).
8. A second identity on a principal would change who the audit names (S-8). It cannot be used today.

**Not in scope; depends on findings this change does not fix.**

- **C1, spec 001.** Under `src/` no service has an identity provider. Until 001 is released and each service is configured, every row says `demo-user`, nothing is refused, and every caller can read the export (S-6). This change does not deliver attribution on its own.
- **C3, spec 003.** Tenant, user and patient in the log scope come from headers, and the gateway passes them through (S-4).
- **C2.** Almost every audited route has no guard. A caller who reaches a service with no token is served and recorded as `(unauthenticated)` with a 2xx status. This includes the bulk export, the creation of user accounts with a caller-chosen external id and role, and the lookup by external id (S-2, S-5, S-7).
- **N3, spec 015.** The write is not awaited and a failure is only logged. A caller can cause the failure (S-11). A service whose audit table cannot be created starts anyway and writes nothing (`DatabaseExtensions.cs:122-125`).
- **N4.** Tenant, patient and outcome are not in the record. The export is not limited to a tenant.
- **N1, spec 007.** The export reads one of the nine tables.
- **N2, spec 008.** Nothing in the repository enforces append-only; the middleware's comment says otherwise (S-14).
- **No spec that I was shown.** Calls from the BFF and between services carry no user (S-3). The audited prefixes are not the list of PHI routes (S-15). Reading the export is not audited (S-13). The idempotency cache answers with no token (the plan's first item under "Found while planning"); after this change such an answer on `/api/v1/agents/triage` shows in the trail as `(unauthenticated)` with a 2xx status, which is an improvement. No workflow runs the tests, by the plan (S-10).

## Verdict by work item

| Work item | Verdict | Findings |
|---|---|---|
| T001, the middleware | Accept | No must-fix. Open should-fix: S-4, S-5, S-6, S-8; S-7 is the owner's decision. S-8 is new code and should be fixed in this change. Notes: S-14. |
| T002, the nine `Program.cs` files | Accept | No finding. The nine orders are as planned. The FHIR order is acceptable while the consent middleware refuses nothing; see S-10 for when it does. |
| T003, the middleware and pipeline tests | Accept | No must-fix. Open should-fix: S-9, and the tests S-8 asks for. AC-004 is proven for a refusal by a service, which is all the code does (S-2). |
| T004, the order tests | Accept | No must-fix. Open should-fix: S-10. |
| The spec's documents (not a work item I was given) | Return | Must be resolved before the gate: S-1 (`spec.md`, `threat-model.yml`), S-2 (`threat-model.yml`, `spec.md`), S-3 (`privacy-impact.md`). Should-fix: S-12 (`rollout.yml`). |

The code does what the plan says. The gate should not pass until S-1, S-2 and S-3 are resolved: a kit check fails, one threat is recorded as mitigated where it is not, and the privacy impact is wrong about where the identifier goes and who sees it. An accepted work item is not a resolved finding: each should-fix above stays open until I see the change that closes it or the spec that takes it.

## Round 2

- **Date and reference:** 2026-11-22; the rework `03c9f5b..HEAD` (HEAD `15bf0f9`): five code files and four documents.
- **What I read:** the two diffs the orchestrator named; the five changed code files in full; `threat-model.yml`, `privacy-impact.md` and `rollout.yml` in full, and the changed parts of `plan.md`; `.github/workflows/microservice-deploy.yml:440-480`, which the corrected privacy impact cites. Kit checks run again: `CK-THREAT-MODEL` fails with the same two messages; `CK-PRIVACY-IMPACT` passes.
- **Unverified:** nothing was built or run, so "passes" below means "passes by reading". I did not read `verification/` or `evidence/`; the corrected documents cite a verification report (V-6 to V-11) that I have not seen. I cannot read the folders of specs 001, 002, 003, 007, 008, 015 or 016, so "given to spec N" is what this spec's documents say, not something I checked there.
- **A correction to round 1:** assumption 4 said gate G3 had approved the plan. The plan says nobody has approved either version (`plan.md:8`). No verdict changes. Decisions P1 to P3 and the questions at `plan.md:100-106` go to the owner as open, not as settled.

### 1. The fifteen findings

| Finding | Status | What shows it |
|---|---|---|
| S-1 | Open. The owner. | `CK-THREAT-MODEL` still fails. `spec.md:40-41` is approved text that only the owner can amend, and it is unchanged. The threat model now states this truthfully (`threat-model.yml:3-4`). |
| S-2 | Partly resolved. The owner. | The threat model is truthful now: TH-2 holds for a refusal by a service and not at the gateway (`threat-model.yml:19`), and the gateway is open threat 1, given to the owner (`threat-model.yml:27`; `plan.md:89, 103`). FR-003 and `spec.md:68` are approved text and still say more than the system does. |
| S-3 | Resolved as a document. | The path, the provider, the three stores, the readers and the lookup are corrected (`privacy-impact.md:14-23, 26, 29-33, 36-37`), and the workflow it cites says what it claims (`microservice-deploy.yml:447-478`). One decision is left with the owner: whether logs carry the identifier (`privacy-impact.md:11`; `plan.md:101`). |
| S-4 | Partly resolved. | The part in T001 is done: the completion line and the failure line name the resolved user (`PhiAuditMiddleware.cs:97-100, 162-165`), tested behind the tenant-context middleware (`PhiAuditPipelineTests.cs:57, 160`; `PhiAuditMiddlewareTests.cs:338, 394`). The scope is still set by the header: spec 003 (`threat-model.yml:13, 31`). |
| S-5 | Open. Given to specs 015 and 016. | Not changed, and the plan says so (`plan.md:30, 92`). Listed as open threat 2 (`threat-model.yml:28`). |
| S-6 | Partly resolved. | The rollout waits for spec 001 and for a provider on each service, reads a real subject back in staging and halts on `demo-user` (`rollout.yml:6, 17, 26`). The audit still records the made-up user as a person: spec 001 (`threat-model.yml:30`). The deployment falls back to that user with one echoed line when two variables are unset (`microservice-deploy.yml:457-462`). |
| S-7 | Open. The owner. | The plan no longer claims the join and puts the question first (`plan.md:50, 100`; `threat-model.yml:32`). One part is answered: the deployment gives every service the same client id and audience, so a person has one subject across the services (`microservice-deploy.yml:469-477`). |
| S-8 | Resolved. | Only an authenticated identity can name the user (`PhiAuditMiddleware.cs:125-137`); two identities are tested in both orders (`PhiAuditMiddlewareTests.cs:420, 434`). The limit for a policy scheme that fails is stated (`plan.md:26`; `threat-model.yml:36`). |
| S-9 | Points 1, 2 and 3 resolved; 4 and 5 open. | The event's user is asserted (`PhiAuditPipelineTests.cs:124-134`; `PhiAuditMiddlewareTests.cs:299, 322`); a 403 is recorded under the caller's subject (`PhiAuditPipelineTests.cs:237`); the tenant-context middleware is in the pipeline (`PhiAuditPipelineTests.cs:57`). Point 4 is not built and the plan says so, with a staging check in its place (`plan.md:46-47`; `rollout.yml:17`); the wording of AC-002 is the owner's. Point 5 is unchanged. |
| S-10 | Point 1 partly resolved; point 2 resolved; points 3 and 4 open. | What may precede the audit is a list, with the consent middleware as an exception for FHIR only (`RequestPipelineOrder.cs:35-57, 105-111`; `RequestPipelineOrderTests.cs:154-185`). Comments, blocks, chains, second registrations and `#if` now fail for the three registrations (`RequestPipelineOrder.cs:64-91`). Two limits remain (R2-1, R2-2). Point 3 is stated as a limit (`RequestPipelineOrder.cs:17-19`); point 4 is a rollout precondition (`rollout.yml:7`). |
| S-11 | Open. Given to spec 015. | Listed as open threat 3 (`threat-model.yml:29`; `plan.md:94`). The path is still not cut to fit. The failure line now holds what the lost row held (`PhiAuditMiddleware.cs:162-165`). |
| S-12 | Resolved. | Preconditions, staging checks, the change-over time and the signals (`rollout.yml:5-7, 16-19, 25-27`). |
| S-13 | Open (note). | Recorded for the specs that own the export (`plan.md:96-97`; `threat-model.yml:34`). Nothing was expected here. |
| S-14 | Partly resolved (note). | The class comment no longer claims rows cannot be altered (`PhiAuditMiddleware.cs:13-15`); an inline comment still says "append-only" (`PhiAuditMiddleware.cs:105`). The markers are pinned by a test (`PhiAuditMiddlewareTests.cs:277`) and `(no-subject)` has a halt signal (`rollout.yml:26`). The words that mean "no person" are still not listed for a reader of the export. |
| S-15 | Open (note). | Recorded, with no spec to own it yet (`threat-model.yml:35`; `plan.md:95`). The notification service is named as writing no record (`plan.md:47`; `rollout.yml:17`). |

### 2. What the rework broke or introduced

Nothing is broken that I can see by reading. I traced the new order check over the nine real `Program.cs` files. Each has only listed statements in front of the audit, one registration of each kind, one mention of the middleware and no preprocessor condition; the one `#pragma` in the agent service is not a condition (`src/HealthQCopilot.Agents/Program.cs:25`). No other file under `src/` names the middleware, so the new test for that passes too. I found no test that asserts something the code does not do.

Six new points. None is a must-fix.

- **R2-1, should-fix, T004 and `plan.md`.** The list of what may precede the audit is applied only to top-level statements that begin `app.` (`RequestPipelineOrder.cs:68-69, 105-108`). A registration inside a block, behind `await`, or made by a helper call, in front of the audit, is not read. The file's own list of what it cannot see (`RequestPipelineOrder.cs:16-20`) and the plan (`plan.md:45`, "anything in front of it") do not say so. How it is met: someone wraps an output cache in a feature-flag block ahead of authentication, and the build stays green. What must change: the plan states the limit now. The check is closed by the spec that changes the consent middleware, which has to touch this order anyway.
- **R2-2, should-fix, outside this change (the spec that changes the consent middleware).** The exception for the consent middleware is tied to its registration line, not to what the middleware does (`RequestPipelineOrder.cs:48-57`). No test of that middleware exists under `tests/`. A change inside it that makes it refuse passes every check; the file says as much for its allow-list (`RequestPipelineOrder.cs:17-18`). This is the case I described under S-10 and it is still possible. The likelier repairs, moving the consent middleware or authentication, are now caught. What must change: the spec that changes the consent middleware moves it behind the audit and removes the exception in the same change, and its security review checks that.
- **R2-3, note, T001.** The completion line and the failure line use the attribute name `UserId`, the name the scope uses (`PhiAuditMiddleware.cs:99, 164`; `TenantContextMiddleware.cs:51`). The text of each line is right. Which of the two values a log store keeps under that name is still not established. It goes away with spec 003. TH-1's `holds_for` (`threat-model.yml:13`) is true of the text of the lines.
- **R2-4, note, T001.** With two authenticated identities, the first that has a subject names the user (`PhiAuditMiddleware.cs:129-135`). No test pins that, and no such principal exists today.
- **R2-5, note, T001 and the owner.** The rework adds the identifier to two more log lines before the owner has chosen whether logs carry it (`plan.md:101`). That is the branch I asked for under S-4. If the owner chooses the other, it is a change to T001's file after the item has closed, and the owner has to reopen it or give it to another spec.
- **R2-6, note, `rollout.yml:18`.** The request with no token has to go to the OCR service itself. Sent through the gateway it is refused there and no row is written (S-2), which would read as a failed check.

### 3. Verdict by work item

| Work item | Verdict | Why |
|---|---|---|
| T001, the middleware | Accept | S-8 and the T001 part of S-4 are resolved, and I have seen the change. S-5, S-6 and S-7 stay open with the specs and the owner named above; none of them is resolved by this verdict. |
| T003, the middleware and pipeline tests | Accept | The points of S-9 that I required (1, 2 and 3) and the tests S-8 asked for are there. Points 4 and 5 stay open. |
| T004, the order tests | Accept | What I required under S-10 point 1 is there: a list, and the consent middleware as a named exception. R2-1 and R2-2 are open and recorded. They are narrow, the likelier mistakes are now caught, and the spec that changes the consent middleware is the place to close both. I do not use the last return for them. |

T002 was accepted in round 1 and is unchanged.

### 4. Verdict on the documents

**Must-fix findings that still stand before the gate: S-1 and S-2. Both wait for the owner. The authors have nothing left to do on them.**

- **S-1, the owner.** Amend `spec.md:40-41` so that AC-004 and AC-005 are abuse cases, or give TH-2 and TH-3 criteria that are. The check then passes. A waiver does not resolve it.
- **S-2, the owner.** Narrow FR-003 and the sentence at `spec.md:68` to a refusal made by a service, or bring the gateway into this spec or a new one (`plan.md:103`). The threat model already says where the requirement holds and where it does not.
- **S-3 no longer stands.** The privacy impact is right. It leaves the owner one decision: whether the logs carry the identifier. If they do, someone has to say who reads the telemetry store and how long it keeps data; the document says that nobody knows (`privacy-impact.md:23, 26`).

Also the owner's, before the gate means anything:

- The plan is a draft that nobody has approved (`plan.md:8`). Its questions at `plan.md:100-106` are the owner's, and the first is how a recorded identifier is resolved to a person (S-7).
- The plan's third question (`plan.md:102`) is a real option from the audit's side. Since the identity is read after the pipeline, an audit placed in front of everything would also record what the consent middleware answers, which removes the exception in T004. It changes FR-001, AC-001 and AC-005, so it is an amendment.
- The release waits for spec 001 and for a workflow that runs the tests (`rollout.yml:6-7`).

For the authors, should-fix and no code: `plan.md:45` gains the limit in R2-1, and `rollout.yml:18` says the request goes to the OCR service itself (R2-6).

Every finding marked open or partly resolved above stays so until I see the change that closes it or the spec that takes it.
