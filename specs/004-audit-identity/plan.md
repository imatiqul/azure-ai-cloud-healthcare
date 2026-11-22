# Plan: audit records name the authenticated user (004, finding C4)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3` (`main` after pull request 72)
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, QLT-3, QLT-6 to QLT-9, CHG-18, CHG-19, AGT-3
- **Assumptions:** P1 to P3 under "Decisions this plan makes"
- **Unverified:** the plan was written from reading the code at `8d04df3`. Nothing in it had been built or run when it was written

## What the code does today

`PhiAuditMiddleware` reads the user on line 62, before it calls the rest of the pipeline, and reads only the `oid` claim. All nine services register it before `UseAuthentication`, so no claim exists yet and every record says "anonymous". Two services have another middleware between the audit middleware and authentication:

| Service | Order today (`Program.cs`) |
|---|---|
| Agents (lines 389-394) | tenant context, security headers, **audit**, idempotency, authentication, authorization |
| FHIR (lines 82-87) | tenant context, security headers, **audit**, consent, authentication, authorization |
| Identity, Notifications, OCR, Population Health, Revenue Cycle, Scheduling | tenant context, security headers, **audit**, authentication, authorization |
| Voice (lines 56-59) | security headers, **audit**, authentication, authorization |

## The change

### 1. The middleware (`src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs`)
- The user of a record is the subject of the authenticated identity: the `sub` claim, or the name-identifier claim that ASP.NET Core maps `sub` to. Nothing else is read: no header, no `oid`.
- A request with no authenticated identity is recorded as `(unauthenticated)`. An authenticated request whose token carries no subject is recorded as `(no-subject)` and logged as a warning.
- The identity is read again after the pipeline has run, and that value goes into the record and the event. The record is written after the request in any case; this way it names whoever the pipeline authenticated, including where a policy authenticates with a scheme of its own.
- Nothing else in the file changes: the audited paths, the two log lines, the write that is started and not awaited, and the event all stay.

### 2. The order in the nine services

The audit middleware goes directly after `UseAuthentication` and before `UseAuthorization`. Before authorization, because authorization answers a refused request itself: a middleware placed after it would never see a 401 or a 403, and FR-003 would fail.

| Service | Edit | Why this edit |
|---|---|---|
| Identity, Notifications, OCR, Population Health, Revenue Cycle, Scheduling, Voice | Swap the audit line and the authentication line | They are adjacent; nothing else moves |
| Agents | Move the authentication line up, above the audit line | The audit middleware must stay outside the idempotency middleware. That one answers a repeated request from a cache without calling the endpoint. Today such an answer is audited; if the audit middleware moved below it, it would not be |
| FHIR | Move the audit line down, below the authentication line | Moving authentication up would put it above the consent middleware, which would then see a user for the first time and start refusing requests (see "Found while planning", 2). This spec does not own that change in behaviour. The consent middleware never refuses anything today, so leaving it outside the audit loses no record |

### 3. Tests
- `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs` exists and pins today's behaviour in 11 tests. Two of them assert what this spec changes (`oid`, and the word "anonymous") and are rewritten. A third sets its user up through the `oid` claim; its set-up changes and its assertions do not. The other eight must pass unchanged.
- `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditPipelineTests.cs`, new: the middleware in a real request pipeline with the framework's own authentication and authorization middleware and a test scheme. Covers AC-002, AC-003 and AC-004.
- `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrderTests.cs`, new: reads each service's `Program.cs` and fails, naming the service, when the audit middleware is not directly between authentication and authorization. Covers AC-001 and AC-005. It is in the unit test project because no workflow runs the architecture test project (see "Found while planning", 4).

## Decisions this plan makes
- P1: the subject is `sub`, or the mapped name-identifier claim. The identity service reads the same two for a user's external identifier (`src/HealthQCopilot.Identity/Endpoints/IdentityEndpoints.cs:132-133`), so an audit record can be joined to a user account. This is assumption A1 of the spec, made exact.
- P2: the markers are `(unauthenticated)` and `(no-subject)`. Brackets cannot occur in a subject issued by the identity provider. This is A2 of the spec, made exact.
- P3: all nine services change in one pull request and one release (NFR-002).

## What does not change
- The record's shape and the `phi_audit_logs` table (FR-005, AC-006). No migration is added or edited.
- Which paths are audited, and that a failed write is only logged (N3, spec 015).
- The tenant in the log context, which still comes from a header (C3, spec 003).

## Requirements, criteria, tasks

| Requirement | Criterion | Proven by | Task |
|---|---|---|---|
| FR-001 | AC-001 | `RequestPipelineOrderTests`: one case per service | T002, T004 |
| FR-002 | AC-002 | `PhiAuditPipelineTests`: a valid token; `PhiAuditMiddlewareTests`: the subject claim, in both forms | T001, T003 |
| FR-002 | AC-003 | `PhiAuditPipelineTests`: a token for U and an `X-User-Id` header naming V | T001, T003 |
| FR-003 | AC-004 | `PhiAuditPipelineTests`: no token, a guarded endpoint, status 401, the marker | T001, T003 |
| FR-004 | AC-005 | `RequestPipelineOrderTests`: the check applied to a pipeline in the old order fails and names the service | T004 |
| FR-005 | AC-006 | No file under any `Migrations` folder and no line of `AuditDbContext.cs` is in the change | T005, T006 |

## Risks the plan carries
- **001 is not fixed.** A deployment with no identity provider configured authenticates everyone as the demo user, and records will say `demo-user`. Recorded as residual risk; not fixed here.
- **003 is not fixed.** The tenant is still caller-asserted. It is not in the record.
- **Readers see new values.** `GET /api/v1/admin/audit/summary` groups by user and returns the 100 largest groups (`AuditExportEndpoints.cs:60-79`). With one "anonymous" user that was every row; with real users it is the 100 busiest user-and-method pairs. The export is unaffected. The event stream's `UserId` changes in the same way.
- **Old records stay as they are.** Every record written before this change says "anonymous". Nothing rewrites them.
- **A second middleware that authenticates.** If a policy names its own scheme, the user can change during authorization. Reading the identity after the pipeline covers it.

## Found while planning, and not part of this change

Each is reported to the owner. None is fixed here.

1. **The idempotency middleware answers before authentication and authorization.** In the agent service, a POST to a listed path with an `X-Idempotency-Key` whose answer is cached gets that answer back at once (`IdempotencyMiddleware.cs:59-79`). The cache key is the method, the path and the key: no user and no tenant. Anyone who has a key gets the stored clinical response for 24 hours, with no token. The key is written to the debug log on each hit (line 71).
2. **The consent middleware never checks consent.** In the FHIR service it runs before authentication, finds no claim, and passes the request on with the comment "let auth middleware handle 401" (`ConsentEnforcementMiddleware.cs:55-63`). When it does see a user it will treat the caller's own subject as the patient, and it allows access whenever the identity service cannot be reached.
3. **The tenant-context middleware runs before authentication too**, by its own comment (`TenantContextMiddleware.cs:17-18`), so the user in the log context is a header or "anonymous". That is finding C3 and spec 003.
4. **No workflow runs the architecture test project.** `dotnet test` is called for the unit and integration projects only (`pr-validation.yml:50, 57`; `microservice-deploy.yml:282, 291`). The 18 architecture tests Phase 1 counted are not part of any pipeline run.
5. **No workflow has run since May 2026.** By the repository's public record on 2026-11-22, the last run on a pull request was on 2026-05-04, on a push 2026-04-30, on a schedule 2026-05-10. Pull request 72 and the two latest commits on `main` have no check run. Until that changes, "the build fails" in AC-001 and AC-005 has no pipeline to fail in.

## For the reviewer at G3
- Is the subject the right identifier (P1)? The code read `oid` before, and never successfully.
- Is the FHIR order acceptable, given that it leaves the consent middleware as it is?
- The threat model lists three threats. Two of them are tested by criteria the approved spec did not write as abuse cases (AC-004, AC-005), and the kit's check says so. Marking them is an amendment to the spec.
