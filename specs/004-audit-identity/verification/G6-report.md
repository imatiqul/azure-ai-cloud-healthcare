# Independent verification: 004-audit-identity

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository, branch `sdd/004-audit-identity`, code change `769efd4..HEAD`, base `8d04df3`
- **Requirement IDs exercised:** QLT-1
- **Assumptions:** (1) The harness's stand-ins behave as the real xUnit, FluentAssertions, NSubstitute and EF Core in-memory packages do for the calls these tests make. I read the stand-ins and found no call where they are laxer than the real libraries as I know them; I could not run the real ones. (2) With Microsoft.Identity.Web's default claim mapping, the token's `sub` reaches the middleware as the name-identifier claim. This is an inference: the role policies in `JwtBearerExtensions.cs:41-51` require `ClaimTypes.Role`, which only works with that mapping. (3) "Stored shape" in FR-005 means the table's columns and types, not the values in `user_id`, which the spec intends to change. (4) Line numbers are at HEAD `03c9f5b`.
- **Unverified:** Nothing here is a run of the solution's own build or of `tests/HealthQCopilot.Tests.Unit`; packages cannot be restored on this machine. Not verified for that reason: that the nine `Program.cs` files compile; the tests against the real test libraries and analyzers; any service started; the real bearer handler (claim types, malformed and expired tokens, unreachable keys); PostgreSQL. Not verified because the files are not on my input list: whether any pipeline runs the unit test project; whether another test in the repository asserts the old behaviour; the service-defaults library, the gateway and the bff; the 206 files of the branch outside `src` and `tests`. No staging evidence exists. Details under "The evidence".

## What I was given

- My role file, `.specify/agentic/agents/independent-verifier.yml`, and the input list, `verification/G6-inputs.yml`.
- What the change must satisfy: the spec, plan, task list, impact report, threat model, privacy impact, test strategy and rollout of spec 004; the constitution and its map; the system map.
- The change: 14 files under `src` and `tests` (`git diff --stat 769efd4 HEAD -- src tests`: 683 insertions, 27 deletions). `git diff --stat 8d04df3 769efd4 -- src tests` is empty, so the base of the code is `8d04df3` as stated.
- Five evidence files, and ten source folders to read around the change.
- I did not open the work records, reviews, other specs, `docs/`, commit messages, or the other files in this spec's folder (`briefs/`, `origin.yml`, `trace-manifest.json`). I saw their names in directory listings and in tool output, nothing more. The kit's CK-WAIVER output quoted single lines from files outside my list; I used none of them.
- Instructions addressed to me inside repository files, test output or tool output: none found.

## What I ran

Everything ran offline. My own programs are under `/tmp/g6`, outside the repository. `git status --short` gave the same output before and after every run of mine; this report is the only file I wrote in the repository. The harness leaves an empty, ignored `tests/HealthQCopilot.Tests.Unit/bin` directory; it was there before my runs. While I was finishing, at 16:26, one file that is not mine appeared in `specs/004-audit-identity/reviews/`; I did not open it.

1. **The harness, as named in the evidence** (.NET SDK 10.0.115, ASP.NET Core 10.0.15):
   - `run.py --repo /home/claude/work/hq-c4`: `49 passed, 0 failed`.
   - `... --at 8d04df3`: `11 passed, 0 failed`.
   - `... --seed --base 8d04df3`: `9 of 9 seeded defects caught`, with the same tests named per defect as `T004-order-tests.md` lists.

2. **My own seeded defects**, applied to a temporary copy with the harness's own build-and-run function (seven builds):

   | Seed | Defect | Result |
   |---|---|---|
   | S1 | The event sent to the audit stream carries a different user from the stored record | Not caught: 49 of 49 pass |
   | S2 | The `PHI_ACCESS` log line takes its user from the `X-User-Id` header | Not caught |
   | S3 | A non-blank `X-User-Id` header replaces the subject of a valid token | Caught by 4 tests |
   | S4 | A request answered 403 is not recorded | Not caught |
   | S5 | The subject is lower-cased before it is recorded | Not caught |
   | S6 | The record's time and correlation id are not stored | Not caught |
   | S7 | The name-identifier claim is preferred to `sub` | Caught by 1 test |

3. **A tenth service that audits before authentication**, added to a temporary copy (three builds):

   | Case | Set-up | Result |
   |---|---|---|
   | X1 | Old order, the usual registration line, tests untouched | 1 failure: `EveryServiceThatRegistersTheAuditMiddlewareIsChecked` |
   | X2 | The same, after its name is added to the `AuditedServices` array only | All 49 pass |
   | X3 | Old order, registered with `app.UseMiddleware(typeof(PhiAuditMiddleware))`, tests untouched | All 49 pass |

4. **The state `T001-middleware.md` describes**, rebuilt in a temporary directory (everything at `8d04df3`, only the middleware from HEAD): `8 passed, 3 failed`, the same three tests.

5. **The real `RequestPipelineOrder.cs` on twelve texts I wrote** (a console program that compiles the file by path):

   | Case | Text | `Check` returns |
   |---|---|---|
   | O1 | The audit registration inside a `/* */` comment | null (passes) |
   | O2 | `app.UseAuthentication()` inside `if (false) { }`, then audit, then the real authentication | null |
   | O3 | The audit registration inside `#if AUDIT ... #endif` | null |
   | O4 | Two refusing middlewares before authentication, then authentication, audit, authorization | null |
   | O5 | `app.MapWhen(..., branch => branch.Run(Refuse))` between authentication and audit | null |
   | O6 | Old order, registered with `UseMiddleware(typeof(...))` | "not registered"; `RegistersAudit` false |
   | O7 | Old order, registered through an extension method | "not registered"; `RegistersAudit` false |
   | O8 | Right order, builder variable not named `app` | "not registered" (false alarm) |
   | O9 | Right order, chained in one statement | "not registered" (false alarm) |
   | O10 | Audit registered twice, once after authorization | null |
   | O11 | Authorization registered twice, audit after the first | "registered after authorization" |
   | O12 | The three lines inside a method that is never called | null |

6. **The real middleware on a real ASP.NET Core host** (a console program: `WebApplication`, Kestrel on loopback, the framework's routing, authentication and authorization; a test scheme that takes the subject from `Authorization: Test <subject>`; the harness's EF stand-in). This goes beyond the pipeline tests, which build the three middlewares by hand and set the endpoint themselves.

   | Case | Request | Response | Record | `PHI_ACCESS` log line |
   |---|---|---|---|---|
   | H1a | Valid token, guarded endpoint | 200 | `clinician-7`, 200 | `clinician-7` |
   | H1b | No token, guarded endpoint | 401 | `(unauthenticated)`, 401 | `(unauthenticated)` |
   | H1c | Valid token for `user-u`, `X-User-Id: user-v` | 200 | `user-u`, 200 | `user-u` |
   | H1d | Valid token, policy needs a role it lacks | 403 | `clinician-7`, 403 | `clinician-7` |
   | H1e | Valid token, the endpoint throws | 500 | none, and no event | `clinician-7` |
   | H1f | No token, audited prefix, no endpoint | 404 | `(unauthenticated)`, 404 | `(unauthenticated)` |
   | H1g | Valid token, mixed-case subject | 200 | recorded unchanged | unchanged |
   | H2a | Valid default-scheme token; the endpoint's policy names another scheme, no credential for it | 401 | `(unauthenticated)`, 401 | `clinician-7` |
   | H2b | As H2a, with a valid credential for the other scheme | 200 | `integration-svc`, 200 | `clinician-7` |
   | H3 | Agent-service order with a middleware that replays a stored answer; the replay sent with no token | 200 | `(unauthenticated)`, 200 | `(unauthenticated)` |
   | H5a | New order, the authentication handler throws | 500 | none | none |
   | H5b | Old order, the authentication handler throws | 500 | none | `(unauthenticated)` |
   | H4 | `ResolveUserId` on a principal with an authenticated identity that has no subject and a second, unauthenticated identity that has a `sub` claim | | returns the second identity's `sub` | |

   The event carried the same user as the record in every case that wrote one. H3 uses my own replaying middleware, not the real `IdempotencyMiddleware`, which needs a cache; the real one returns on a hit in the same way (`IdempotencyMiddleware.cs:62-78`).

7. **The kit's checks** (`agentic.py --root /home/claude/work/hq-c4 check ...`):

   | Check | Result |
   |---|---|
   | CK-VERIFY-INPUTS, CK-TRACE | ok |
   | CK-THREAT-MODEL | FAIL: "AC-004 tests threat TH-2 but is not written as an abuse case in the spec"; the same for AC-005 and TH-3 |
   | CK-TOUCH, no file list | ok, with "skipped the file comparison: no base ref or list of changed files was given" |
   | CK-TOUCH, `--changed-files` with the 14 files | FAIL: "`PhiAuditMiddleware.cs` belongs to event-hubs-audit, which no spec in this change declares in `touches`"; note: "4 changed file(s) are not indexed to any node in the map" |
   | CK-CHARACTERIZATION | FAIL for 004: "the characterization tests did not pass (result: not-run)" |
   | CK-GATE-RECORD | FAIL for 004: no approving decision record for G1, G2 (plan exists) or G3 (tasks exist) |
   | CK-IMPACT, CK-TEST-STRATEGY, CK-TIER, CK-TIER-RAISE, CK-PRIVACY-IMPACT, CK-DOMAIN-SECTIONS, CK-ROLLOUT, CK-PROGRESSIVE, CK-DATA-PLAN, CK-DATA-CLASS, CK-SHARED-STORE, CK-CONSUMER-MATRIX, CK-PATH-DIFF, CK-DRIFT-SPEC, CK-CONSTITUTION, CK-TRACE-GENERATED, CK-WORKITEM, CK-CROSS-SPEC, CK-SECURITY-EVIDENCE, CK-APPROVER, CK-AMENDMENT, CK-LANE, CK-ROLES, CK-AUTHOR-NEQ-VERIFIER | ok |
   | CK-SHARED-SEMVER, CK-MIGRATION-DRIFT, CK-MIGRATION-ENGINE, CK-WAIVER | FAIL across the repository; none of the failures is caused by this change |

8. **Smaller checks.**
   - AC-006: `git diff --name-only 8d04df3 HEAD | grep -ciE 'migrations/|AuditDbContext|DatabaseExtensions|\.sql$'` printed `0` (220 files in the branch).
   - `dotnet format whitespace --folder --verify-no-changes --include <the 14 files>`: `Formatted 0 of 14 files`, exit 0.
   - The table in `T002-order.md`, re-derived with `grep -n` on `git show 8d04df3:<file>` and on the working copy: every line number matches.
   - The seven patterns of `PhiRedactionProcessor.cs`, applied in Python to sample subjects: an opaque subject is untouched; a subject in e-mail form becomes `[EMAIL-REDACTED]`; a GUID whose last two groups are all digits is partly replaced.

## Verdict by acceptance criterion

The middleware and the nine pipeline edits do what the spec asks as far as this machine can show. No criterion has been shown by the solution's own tests (V-2).

### Requirements and criteria

| Criterion | Verdict | Evidence |
|---|---|---|
| FR-001, AC-001 | Met in the source text. Not confirmed by a build. | I read the nine files. Authentication, audit, authorization are at lines: Agents 391, 394, 396; Fhir 85, 87, 88; Identity 64, 66, 67; Notifications 56, 58, 59; Ocr 47, 49, 50; PopulationHealth 73, 75, 76; RevenueCycle 63, 65, 66; Scheduling 56, 58, 59; Voice 57, 59, 60. The nine rows of the order test pass in the harness. No `Program.cs` was compiled and no service was started. |
| FR-002, AC-002 | Met at the middleware. Cannot be confirmed here through a service with a real token. | `PhiAuditMiddleware.cs:87, 120-129`. `ValidToken_TheRecordNamesTheTokensSubject`, `PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity` and the name-identifier variant pass; seeds D1 and D6 are caught; H1a. Not confirmed: the bearer handler was never run, so the claim the subject arrives under is assumption 2; no service ran; the notification service has no audited route at all (V-6). |
| FR-002, AC-003 | Met at the middleware. | The middleware reads no header. The three rows of `ValidTokenAndAHeaderNamingAUser_...` and `PhiPath_IgnoresAUserNamedInARequestHeader` pass; my seed S3 is caught by 4 tests; H1c. The header still sets the user in the log context (`TenantContextMiddleware.cs:33-36`); that is spec 003 and outside this criterion. |
| FR-003, AC-004 | Met at the middleware for no token and for a token the scheme rejects. Cannot be confirmed here for the real bearer handler. | `NoToken_TheRequestIsRefusedAndStillRecorded` and `AnExpiredToken_...` pass; seed D8 is caught; H1b: 401, one record, the marker, status 401. Not confirmed: malformed and expired tokens against the real handler, and the case where its keys cannot be fetched. With no `AzureAd` configuration every request is authenticated as `demo-user` (`JwtBearerExtensions.cs:27-34`), so the case cannot arise there; the spec declares that (001). |
| FR-004, AC-005 | Met for the nine services as they are written. Not met for a service that registers the middleware in another form. "The build fails" cannot be confirmed here. | Seed D9: the nine rows fail when the files are put back to the base order, and each row carries the service's name. `AuditBeforeAuthenticationFailsAndNamesTheService` passes. X2 and X3: a tenth service in the old order passes all 49 tests (V-5). I was given no pipeline definition and no pipeline run. |
| FR-005, AC-006 | Met. | 0 of the branch's 220 changed files is under a `Migrations` folder, is `AuditDbContext.cs`, is `DatabaseExtensions.cs` (which holds the table's `CREATE TABLE`, lines 105-115) or is a `.sql` file. `PersistAuditEntryAsync` and `PhiAuditLog` are not in the diff. No test covers this criterion; the search is the evidence. |

### Non-functional requirements

| Requirement | Verdict | Evidence |
|---|---|---|
| NFR-001 | Met, by reading the diff. | The middleware gains one in-memory read of the principal and one log call. It awaits nothing new. The p95 comparison the test strategy plans does not exist. |
| NFR-002 | Met in the change. The release cannot be confirmed here. | All nine files are in the one change. The rollout's canary stage runs old and new revisions side by side for at least two hours (`rollout.yml:10`), by design. |

### Constitution

| Principle | Verdict | Evidence |
|---|---|---|
| P-9, the principle the spec is held to | Partly met. | The part this spec owns is met at the middleware: a record names the authenticated user, and no new record says "anonymous". Tenant, patient and outcome are not in the record (declared: N4). Records written before the change still say "anonymous" (declared). The check P-9 names, `integration-test:audit-attribution`, is still `not built` (V-6). |
| P-4 | Met for the record. Not met for the log context. | The record's user comes from the principal only. The log context still takes it from a header (declared: 003). |
| P-10 | Not met, as before; out of scope. | The write is started and not awaited, and a failed write is only logged (`PhiAuditMiddleware.cs:105, 151-154`); unchanged. V-9 and V-10 are two more ways a record can be missing. |
| P-16 | Not met. | Four kit checks fail on this spec: CK-TOUCH, CK-CHARACTERIZATION, CK-GATE-RECORD, CK-THREAT-MODEL (V-1, V-2, V-12). |
| P-20 | Cannot be confirmed here. | `lib-infrastructure` has no version to change (CK-SHARED-SEMVER fails across the repository). The change to its public surface is additive: two constants. No consumer was built against it. |
| P-21 | Not met yet. | The tests have not passed in the solution's test project, and the characterization record says `not-run` (V-2). AC-006 has no test. |
| P-22 | Cannot be confirmed here. | No coverage was measured. By reading: the nine registration lines the change moves are executed by no test; the order test reads them as text. |
| P-23 | Unchanged. | The discarded task and the catch-all remain (`PhiAuditMiddleware.cs:105, 110, 151`). The spec does not own them. |
| P-25 | Met for this verification. Not met for the gates before it. | CK-AUTHOR-NEQ-VERIFIER and CK-VERIFY-INPUTS pass. G1 to G3 have no decision record (V-12). The code and its tests were written by one session in two roles (V-13). |
| P-6, P-7 | No field is added. One new flow is not written down. | The user identifier now reaches the application logs next to the path (V-7). |

### The plan, per service

| Part | Plan | Change | Verdict |
|---|---|---|---|
| Middleware | Subject from `sub` or the name-identifier claim; two markers; a warning for no subject; identity read again after the pipeline; nothing else | As planned. The first log line now also goes through `ResolveUserId`; the class comment gains a paragraph. `PersistAuditEntryAsync`, the audited paths and the event call are untouched. | Does what the plan says, and nothing else |
| Identity, Notifications, Ocr, PopulationHealth, RevenueCycle, Scheduling, Voice | Swap the audit line and the authentication line | The two lines swap; one comment line is added | As planned; nothing else changes |
| Agents | Move authentication up, above the audit; the audit stays outside the idempotency middleware | Authentication moves from line 393 to 391; two comment lines are added | As planned. One effect beyond the audit's position, which the plan states: authentication now runs before the idempotency middleware (V-11) |
| Fhir | Move the audit down, below authentication; consent stays where it is | The audit moves from line 84 to 87; one comment line is added | As planned. The consent middleware is now in front of the audit. I confirmed it cannot refuse today: it runs before authentication, finds no claim and passes the request on (`ConsentEnforcementMiddleware.cs:55-63`) |
| Tests | Rewrite two existing tests, change one set-up, leave eight; add the pipeline tests and the order tests | The diff of `PhiAuditMiddlewareTests.cs` shows exactly that. Two new test files and the helper | As planned |

In all nine services the record's time and the event's duration now start after authentication has run, because the middleware starts later. Nobody asked for that; it is small.

## Findings

**V-1. Blocker for the gate; no code change needed.** Work item: none; it is the spec's front matter, and T001's file triggers it.
The change touches a node the spec does not declare. `PhiAuditMiddleware.cs` is indexed to `lib-infrastructure` and also to `event-hubs-audit` (`system-map/map.yml:1910-1913`). The spec's `touches` (`spec.md:7`) names the first only; `event-hubs-audit` appears under `depends_on`. The change does alter that node: the user in every event sent to the stream. How I know: CK-TOUCH with the 14 changed files fails with "belongs to event-hubs-audit, which no spec in this change declares in `touches`". Without the file list the same check prints `ok` and "skipped the file comparison", so a run without the list proves nothing. The impact report was computed without the node.

**V-2. Blocker for the gate.** Work item: T005, which T001 to T004 all wait on.
Nothing has been built or run by the solution itself.
- `evidence/characterization.yml:7` says `result: not-run`, and CK-CHARACTERIZATION fails on it.
- The nine `Program.cs` files have never been compiled. The tests have never run against the real test libraries or the xUnit analyzers.
- The evidence files the test strategy names do not exist: `unit-tests.trx` (`test-strategy.yml:7, 10`) and `staging-check.md` (lines 13, 16, 19). There is no end-to-end, performance or resilience evidence.
- The mutation threshold of 60 (`test-strategy.yml:21`) and the coverage P-22 asks for have not been measured.
- Whether another test in the repository asserts the old behaviour ("anonymous", the `oid` claim) is unknown to me; the other test files are not on my list. A full run of the unit and integration projects will show it.
Every "met" above is provisional until this is done.

**V-3. Should-fix.** Work item: T003.
No test checks the user in the audit event or in the log line. `PhiPath_PublishesToEventHubWhenPresent` (`PhiAuditMiddlewareTests.cs:313-326`) asserts that one event was published and nothing about it. `PhiPath_LogsInformationTwice` (lines 131-145) counts calls. How I know: seeds S1 and S2 leave all 49 tests passing. The event stream is the second copy of the audit record (`PhiAuditMiddleware.cs:108-112`), and plan section 1 says the value goes "into the record and the event". FR-002 is unproven for it.

**V-4. Should-fix.** Work item: T003.
Four more gaps in the tests of the middleware.
- A request answered 403 is not tested. The middleware's own comment and the plan give "a 401 or a 403" as the reason for its position. Seed S4 survives. H1d shows the code does record it.
- No test pins the two markers' text. Every assertion compares with the constants; the only literal check is "not anonymous" (`PhiAuditMiddlewareTests.cs:199`). The plan fixes the text (P2), and the rollout's third halt signal searches for it (`rollout.yml:15`).
- Every subject in the tests is lower-case ASCII. Seed S5 survives. Subjects from the identity provider are case-sensitive.
- The three rows of `ATokenTheSchemeDoesNotAccept_...` (`PhiAuditPipelineTests.cs:164-179`) take the same path as the no-token test: the test scheme returns "no result" for each. The "malformed token" case of the test strategy is therefore covered only by the `expired:` row, which is the one path where a scheme rejects a token.
Seed S6 (time and correlation id not stored) also survives; that gap is older than this change.

**V-5. Should-fix.** Work item: T004.
The order check can be passed by a pipeline that is wrong, and a tenth service can escape it.
- The services checked for order are the `[InlineData]` rows (`RequestPipelineOrderTests.cs:20-28`). The census compares what it finds with a separate array (lines 13-17, 48). A service added to the array and not to the rows is never checked for order: X2. `T004-order-tests.md:36` says the census "compares the list with the nine rows, so a tenth service cannot be added unchecked". It does not.
- The census sees only a line that starts with the exact text `app.UseMiddleware<PhiAuditMiddleware>()` (`RequestPipelineOrder.cs:14, 48-49`). A new service that registers the middleware by type or through an extension method is invisible to it: X3, O6, O7. FR-004 is not met for such a service.
- Nothing in front of authentication is looked at (`RequestPipelineOrder.cs:36-42` examines only what is between authentication and the audit), although the check's own message says "nothing that can answer a request may sit in front of the audit". O4 passes. The FHIR consent middleware is in exactly that place; it is harmless only while it runs before authentication.
- Only `//` comments are removed (lines 52-65), only statements that start with `app.Use` count as middleware, and only the first match of each registration is used (lines 21-23). O1, O2, O3, O5, O10 and O12 pass.
The check is sound for the nine files as they are written today. The shared library's README still shows the registration line with no word on order (`src/HealthQCopilot.Infrastructure/README.md:66`).

**V-6. Should-fix.** Work item: the spec and plan; T003 for the test.
P-9's own check is not built, and no test goes through a service. The constitution says the spec for C4 must add `integration-test:audit-attribution`; `constitution.map.yml:32-34` still says `not built`, and nothing in the change is declared to be it. The pipeline tests are in the unit test project and build their own pipeline; none starts a service or uses the real bearer handler. AC-002 says "through any of the nine services", and for one of them it cannot be shown at all: every route of the notification service is under `/api/v1/notifications` (`NotificationEndpoints.cs:14`), which is not on the audited list (`PhiAuditMiddleware.cs:36-50`), so that service records nothing, before or after the change.

**V-7. Should-fix.** Work item: none; `privacy-impact.md`. It arises from T001.
The privacy impact leaves out the logs. It says the middleware writes one row and one event, and "Nothing else reads the record" (line 12); its access paths (line 18) are the export, the event stream and the databases. The middleware also writes the user, method, path and correlation id to the application log (`PhiAuditMiddleware.cs:79-81`), which is exported to Azure Monitor when configured (`ObservabilityExtensions.cs:84-93`). When the event hub is not configured, the event too is written as a log line with the user (`EventHubAuditService.cs:49-57`). Before this change that user was the same word for everyone. After it, anyone who can read the logs sees which subject touched which path, and for a patient reading their own record the subject is the patient's.

**V-8. Note.** Work item: T001.
Reading the identity after the pipeline has two effects the plan does not describe. Nothing in the nine services triggers either today: I searched the ten folders and found no policy that names a scheme, no claims transformation and no code that sets the request's user.
- If an endpoint's policy names its own scheme and the caller has no credential for it, the framework replaces the principal with an empty one. A caller whose token the service had validated is then recorded as `(unauthenticated)`: H2a. The plan's risk paragraph says reading after the pipeline "covers" a second scheme; it covers the case where that scheme succeeds (H2b), not the case where it fails.
- In both cases the `PHI_ACCESS` log line, written before the pipeline, names a different user from the record. The completion line names no user.
- `ResolveUserId` checks the first identity for authentication (line 122) and then takes the first matching claim from any identity (lines 125-126): H4.
The exported log line can also differ from the record when the subject looks like protected data to the log redactor (run 8).

**V-9. Note.** Work item: T001.
A subject longer than 128 characters would leave no record. `user_id` is `varchar(128)` (`AuditDbContext.cs:20`, `DatabaseExtensions.cs:108`). The identity service accepts an external identifier of up to 256 characters (`IdentityValidators.cs:10, 21`; `IdentityDbContext.cs:24`). On PostgreSQL the insert would fail, the failure would be logged, and the request would succeed (`PhiAuditMiddleware.cs:151-154`). Before the change the value was always nine characters. Subjects from Entra ID are far shorter, so this needs an identity provider that issues long ones. I did not reproduce it: there is no PostgreSQL here, and neither the in-memory provider nor its stand-in enforces a length.

**V-10. Note.** Work item: T001; the behaviour is older than the change.
When anything below the audit middleware throws, there is no record and no event: H1e. `await _next(context)` (line 83) is not guarded. I found no exception handling in the ten folders I could read; the service-defaults library is not on my list. One thing is new: if the authentication handler itself throws, the request no longer produces even the `PHI_ACCESS` log line, because the middleware is now behind it (H5a against H5b). The test strategy's resilience case expects a 401 and a record when the keys cannot be fetched. That holds only if the bearer handler fails the token and does not throw; I could not run it.

**V-11. Note.** Work item: T002.
In the agent service, authentication now runs before the idempotency middleware. The plan says so. A replayed answer is still served without authorization, as before; it now passes through authentication first. A replay sent with no token is recorded as `(unauthenticated)` with a 2xx status on a guarded path: H3. That is accurate, and it is exactly what the rollout's third halt signal looks for (`rollout.yml:15`: "above zero"). The first such replay in staging or in the canary will halt this rollout for a fault the plan lists as found and not fixed.

**V-12. Blocker for the gate; known and disclosed.** Work item: none.
Two kit checks fail on this spec and need a person. CK-GATE-RECORD: G1, G2 and G3 have no approving decision record, although the plan, the task list and the code exist; the spec's header says the approvals were given in chat. CK-THREAT-MODEL: AC-004 and AC-005 are not written as abuse cases; the plan says marking them is an amendment. The plan, threat model, privacy impact and rollout I was given still call themselves drafts waiting at G3, and the task list and test strategy drafts waiting at G4.

**V-13. Note.** Work item: the evidence files (T001, T003, T004, T005).
- `test-strategy.yml` names `evidence/unit-tests.trx`; `tasks.md:9` names `evidence/unit-tests.md`. Neither exists.
- `test-strategy.yml:6` says nine tests must not change. The plan says eight, and one whose set-up changes. The diff matches the plan.
- "9 of 9 seeded defects caught" is true, and the file says it is not a mutation score. Five of my seven further defects survive.
- `T001-middleware.md:41` says the implementer did not touch the test file. `G6-inputs.yml:5` says one session wrote the code and the tests, in turn. The tests are not an independent check on the code; V-3 and V-4 are the kind of gap that leaves.
- The command `T001-middleware.md` names can no longer produce its result, because the working copy has moved on. I rebuilt the state (run 4) and got the same result.

**V-14. Note.** Work item: none; the map and the impact report.
See "Map and impact".

## The tests

**Would they fail if the code were wrong?**

| Criterion | Answer |
|---|---|
| AC-001 | Yes for the nine files: D9. Only the text check guards the order. No behavioural test depends on it: `AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller` shows the record is the same in either order, because the identity is read after the pipeline. |
| AC-002 | Yes for the record: D1, D2, D6. No for the event and the log line: S1, S2. No for a change of the subject's case: S5. |
| AC-003 | Yes: S3 is caught by 4 tests, and D7 by 2. |
| AC-004 | Yes for 401: D3, D5, D8. No for 403: S4. The marker's text is not pinned. |
| AC-005 | Yes for the old order and for the audit after authorization. No for the cases in V-5. |
| AC-006 | There is no test. |

**Boundary cases named in `test-strategy.yml` that are not tested.**
- AC-004, "a malformed token": only nominally (V-4).
- AC-002, `(no-subject)`: at unit level only, and without the literal.
- The resilience case, the end-to-end check and the p95 comparison: not done.
- AC-006: a search, not a test.
- The mutation threshold: not measured.

**Assertions that cannot fail.** None is vacuous. Three are weaker than they read:
- The three `ATokenTheSchemeDoesNotAccept_...` rows repeat the no-token path.
- `EveryServiceThatRegistersTheAuditMiddlewareIsChecked` asserts membership of an array, not that the order rows cover it.
- `PhiPath_LogsInformationTwice` counts log calls of any level, because `ReceivedWithAnyArgs` ignores the level argument. That is why seed D5 trips it.

**The source-text check.** Sound for today's nine files, and it fails in the safe direction for most rewrites of a registration (O6 to O9 report "not registered"). It can be fooled as V-5 lists: a block comment, a preprocessor condition, dead code, a branch that answers requests, a refusing middleware before authentication, a second registration, or a new service that registers the middleware in another form. It finds the repository root by walking up to `HealthQCopilot.sln` and throws if it cannot, which is the safe failure.

## The evidence

| File | What it states | When I ran it |
|---|---|---|
| `T001-middleware.md` | 8 passed, 3 failed, with only the middleware changed | Reproduced in a rebuilt state (run 4) |
| `T002-order.md` | The order table at both commits; 19 insertions, 9 deletions; formatting clean | Reproduced: every line number, the stat, and `Formatted 0 of 14 files` for all 14 files |
| `T003-tests.md` | 33 passed, 0 failed | Reproduced: the 20 and 13 rows are part of the 49 |
| `T004-order-tests.md` | 49 passed; 11 passed at the base; 9 of 9 seeded defects; AC-006 search 0 | All reproduced. Its sentence about the census is wrong (V-5) |
| `characterization.yml` | `not-run` | Consistent with CK-CHARACTERIZATION failing |

**What the stand-ins do not reproduce.**
- The solution's build. The nine `Program.cs` files are read as text, never compiled. The middleware is compiled with two other files of the shared library, not as part of it.
- The real `AuditDbContext.cs`. The harness compiles a copy of the record's shape (`Shims/AuditDbContext.cs`), so EF Core's model building for the audit table is not exercised.
- The real xUnit runner, its parallel test classes and its analyzers (warnings are errors in the real build); the real FluentAssertions and NSubstitute.
- The bearer handler and Microsoft.Identity.Web. The pipeline tests and my host use a test scheme.
- PostgreSQL: the column length, the insert, the row-level policy.
- Any service host. My host run (run 6) reproduces the framework's own routing, authentication and authorization on a real server, not a service's `Program.cs`.
- Coverage and a mutation score.

**Verdicts that stay unconfirmed until the solution's own test project runs.** All of them at the level of "passing test" (V-2). In particular: AC-001 and AC-005 as build failures; AC-002 and AC-004 with a real token through a service; that the changed test files compile against the real libraries and analyzers; that no other test in the repository asserts the old behaviour.

## Map and impact

**Touched and not declared.** `event-hubs-audit` (V-1). The four changed test files are indexed to no node in the map.

**Affected and not listed in the impact report.**
- `phi-audit-logs`. The value of `user_id` changes in every row. The identity service's export and summary read it (`AuditExportEndpoints.cs:44-79`); the plan describes the effect on the summary. The export reads the identity service's own table only.
- `event-hubs-audit`. The user in every event changes. The map has no edge to or from this node, so neither the map nor the impact report can say who reads the stream. The spec's own risk section says such readers "will behave differently".
- `entra-id`. The record's user now comes from it.
- The application logs and their exporter, which are not on the map (V-7).

**Listed and not altered.** The report lists nine service databases, 33 event topics, the gateway, the bff and the shell, which it reaches through ownership, publishing and build edges. The change alters none of them; the gateway and the bff are rebuilt against the changed library.

**Not verified.** The gateway and the bff build with the shared library. I could not read them. The census test passing shows that no other `src/HealthQCopilot.*/Program.cs` contains the exact registration line; a registration written another way would be seen neither by it nor by me. Readers of the audit table or the stream outside the ten folders are unknown to me.

**The join to a user account.** The plan (P1) says the record can be joined to a user account because the identity service reads the same two claims. It does (`IdentityEndpoints.cs:132-133`). What that field holds is supplied by the caller at registration, and the comment there calls it the Entra object id. Whether it equals the token's subject in practice I cannot tell.

## Verdict by work item

| Work item | Verdict | Findings that must be resolved |
|---|---|---|
| T001, the middleware | Accept, provisionally | None in the file. V-8, V-9 and V-10 are for the owner to accept or to schedule. |
| T002, the nine `Program.cs` files | Accept, provisionally | None in the files. V-11 is for the owner and the rollout. |
| T003, the middleware and pipeline tests | Return | V-3 and V-4 |
| T004, the order tests | Return | V-5: the two lists and the census at least; the rest fixed or written down as the check's limits |

"Provisionally" means until V-2 is done: neither accepted item has been compiled or tested by the solution.

The gate itself cannot pass until V-1, V-2 and V-12 are resolved. V-6 and V-7 are changes to the spec's documents and to the plan of tests, not to the code.

## Files I read

Governance and spec:
- `.specify/agentic/agents/independent-verifier.yml`
- `.specify/memory/constitution.md`
- `.specify/agentic/constitution.map.yml`
- `system-map/map.yml` (the header, the nodes to line 330, the edges to the audit nodes, the whole index; searched for the audit nodes and for test paths)
- `specs/004-audit-identity/verification/G6-inputs.yml`
- `specs/004-audit-identity/spec.md`, `plan.md`, `tasks.md`, `impact.md`, `threat-model.yml`, `privacy-impact.md`, `test-strategy.yml`, `rollout.yml`
- `specs/004-audit-identity/evidence/characterization.yml`, `T001-middleware.md`, `T002-order.md`, `T003-tests.md`, `T004-order-tests.md`

The change:
- `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs`
- `src/HealthQCopilot.Fhir/Program.cs` in full; the pipeline section and the diff of `Program.cs` in Agents, Identity, Notifications, Ocr, PopulationHealth, RevenueCycle, Scheduling and Voice; the registration lines of all nine at `8d04df3`
- `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs` and its diff, `PhiAuditPipelineTests.cs`
- `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrder.cs`, `RequestPipelineOrderTests.cs`

Around the change, in `src/HealthQCopilot.Infrastructure`:
- `Auth/JwtBearerExtensions.cs`
- `Middleware/IdempotencyMiddleware.cs`, `TenantContextMiddleware.cs`, `SecurityHeadersMiddleware.cs`, `RateLimitingExtensions.cs` (the first 40 lines and the lines that register or reject)
- `Persistence/AuditDbContext.cs`, `DatabaseExtensions.cs`, `AuditInterceptor.cs`
- `Messaging/AuditEvent.cs`, `EventHubAuditService.cs`, `EventHubExtensions.cs`
- `Observability/ObservabilityExtensions.cs`, `PhiRedactionProcessor.cs`
- `HealthQCopilot.Infrastructure.csproj`, `README.md` (lines 25-80)

In the services:
- `src/HealthQCopilot.Fhir/Middleware/ConsentEnforcementMiddleware.cs`
- `src/HealthQCopilot.Identity/Endpoints/AuditExportEndpoints.cs`; `IdentityEndpoints.cs` (lines 44-58, 110-182, 240-256)
- Matched lines only, from searches of the ten folders for code that sets the user, claims transformations, schemes on policies, `X-User-Id`, `IncludeScopes`, "anonymous", `oid`, `ExternalId`, route prefixes and exception handling: `Identity/Validators/IdentityValidators.cs`, `Identity/Persistence/IdentityDbContext.cs`, `Notifications/Endpoints/NotificationEndpoints.cs`, `Notifications/Controllers/NotificationsSubscriberController.cs`, `Notifications/Controllers/AppointmentReminderController.cs`, `Agents/Endpoints/WorkflowOperationalEndpoints.cs`, `Agents/Services/Safety/RedactingChatCompletionDecorator.cs`, `Voice/Hubs/VoiceHub.cs`, `Agents/README.md`, `Notifications/README.md`

Outside the repository: the harness's `run.py`, `Runner.cs`, `Harness.csproj` and its five stand-in files. `Directory.Build.props`, `.editorconfig` and `HealthQCopilot.sln` were used by the harness and by `dotnet format`; I did not open them.
