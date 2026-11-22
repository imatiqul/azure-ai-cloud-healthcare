# T004: the order tests, every test of the change, and seeded defects

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, QLT-3, QLT-7, TRC-2
- **Assumptions:** the stand-ins behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested, because the package registry cannot be reached from where this ran. Nothing below is a run of `tests/HealthQCopilot.Tests.Unit`, and the seeded defects are not a mutation-testing score: the test strategy's threshold of 60 percent is measured by a mutation tool on the real project

Everything here was run with `python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .` (see `T003-tests.md` for what that is), .NET SDK 10.0.115, ASP.NET Core 10.0.15.

## AC-001 and AC-005: the order tests

`RequestPipelineOrderTests` reads each service's `Program.cs`. It is in the unit test project because no workflow runs the architecture test project.

```
PASS  RequestPipelineOrderTests.AMiddlewareBetweenAuthenticationAndTheAuditFails
PASS  RequestPipelineOrderTests.AMiddlewareBetweenTheAuditAndAuthorizationIsAllowed
PASS  RequestPipelineOrderTests.AMissingAuthenticationOrAuthorizationFails
PASS  RequestPipelineOrderTests.ARegistrationThatIsCommentedOutDoesNotCount
PASS  RequestPipelineOrderTests.AuditAfterAuthorizationFails
PASS  RequestPipelineOrderTests.AuditBeforeAuthenticationFailsAndNamesTheService
PASS  RequestPipelineOrderTests.EveryServiceThatRegistersTheAuditMiddlewareIsChecked
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Agents")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Fhir")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Identity")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Notifications")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Ocr")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("PopulationHealth")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("RevenueCycle")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Scheduling")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Voice")
```

- AC-001: one row per service; each passes on this change.
- AC-005: `AuditBeforeAuthenticationFailsAndNamesTheService` applies the check to a pipeline in the old order and expects the service's name in the failure. `AuditAfterAuthorizationFails`, `AMiddlewareBetweenAuthenticationAndTheAuditFails`, `ARegistrationThatIsCommentedOutDoesNotCount` and `AMissingAuthenticationOrAuthorizationFails` are the boundary cases.
- `EveryServiceThatRegistersTheAuditMiddlewareIsChecked` lists the services under `src/` whose `Program.cs` registers the middleware and compares the list with the nine rows, so a tenth service cannot be added unchecked.

## Every test of the change

```
PASS  RequestPipelineOrderTests.AMiddlewareBetweenAuthenticationAndTheAuditFails
PASS  RequestPipelineOrderTests.AMiddlewareBetweenTheAuditAndAuthorizationIsAllowed
PASS  RequestPipelineOrderTests.AMissingAuthenticationOrAuthorizationFails
PASS  RequestPipelineOrderTests.ARegistrationThatIsCommentedOutDoesNotCount
PASS  RequestPipelineOrderTests.AuditAfterAuthorizationFails
PASS  RequestPipelineOrderTests.AuditBeforeAuthenticationFailsAndNamesTheService
PASS  RequestPipelineOrderTests.EveryServiceThatRegistersTheAuditMiddlewareIsChecked
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Agents")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Fhir")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Identity")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Notifications")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Ocr")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("PopulationHealth")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("RevenueCycle")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Scheduling")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Voice")
PASS  PhiAuditMiddlewareTests.NonPhiPath_CallsNextWithoutLogging
PASS  PhiAuditMiddlewareTests.NonPhiPath_DoesNotPublishToEventHub
PASS  PhiAuditMiddlewareTests.PhiPath_AlwaysCallsNext
PASS  PhiAuditMiddlewareTests.PhiPath_CaseInsensitivePathMatching
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotTakeTheUserFromTheOidClaim
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotThrowWhenEventHubIsNull
PASS  PhiAuditMiddlewareTests.PhiPath_IgnoresAUserNamedInARequestHeader
PASS  PhiAuditMiddlewareTests.PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity
PASS  PhiAuditMiddlewareTests.PhiPath_LogsInformationTwice
PASS  PhiAuditMiddlewareTests.PhiPath_PersistenceExceptionIsSwallowedAndLogged
PASS  PhiAuditMiddlewareTests.PhiPath_PersistsAuditEntryWithCorrectFields
PASS  PhiAuditMiddlewareTests.PhiPath_PublishesToEventHubWhenPresent
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheIdentityThePipelineEndedWith
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity
PASS  PhiAuditMiddlewareTests.ResolveUserId_PrefersTheSubClaimToTheMappedOne
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsABlankSubjectAsNoSubject("")
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsABlankSubjectAsNoSubject("   ")
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsAMissingPrincipalAsUnauthenticated
PASS  PhiAuditPipelineTests.ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated("Bearer not-a-token-this-scheme-knows")
PASS  PhiAuditPipelineTests.ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated("Test")
PASS  PhiAuditPipelineTests.ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated("")
PASS  PhiAuditPipelineTests.AnEndpointWithNoGuard_ServedWithoutAToken_IsRecordedAsUnauthenticatedWithItsStatus
PASS  PhiAuditPipelineTests.AnExpiredToken_IsRefusedAndRecordedAsUnauthenticated
PASS  PhiAuditPipelineTests.AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller
PASS  PhiAuditPipelineTests.NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated
PASS  PhiAuditPipelineTests.NoToken_TheRequestIsRefusedAndStillRecorded
PASS  PhiAuditPipelineTests.TwoCallers_EachRecordNamesItsOwnCaller
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("user-v")
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("")
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("user-u")
PASS  PhiAuditPipelineTests.ValidToken_TheRecordNamesTheTokensSubject

49 passed, 0 failed
```

## The existing tests at the base commit

`run.py --repo . --at 8d04df3`: the test file and the middleware as they are at `8d04df3`.

```
PASS  PhiAuditMiddlewareTests.NonPhiPath_CallsNextWithoutLogging
PASS  PhiAuditMiddlewareTests.NonPhiPath_DoesNotPublishToEventHub
PASS  PhiAuditMiddlewareTests.PhiPath_AlwaysCallsNext
PASS  PhiAuditMiddlewareTests.PhiPath_CaseInsensitivePathMatching
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotThrowWhenEventHubIsNull
PASS  PhiAuditMiddlewareTests.PhiPath_ExtractsUserIdFromOidClaim
PASS  PhiAuditMiddlewareTests.PhiPath_FallsBackToAnonymousWhenNoOidClaim
PASS  PhiAuditMiddlewareTests.PhiPath_LogsInformationTwice
PASS  PhiAuditMiddlewareTests.PhiPath_PersistenceExceptionIsSwallowedAndLogged
PASS  PhiAuditMiddlewareTests.PhiPath_PersistsAuditEntryWithCorrectFields
PASS  PhiAuditMiddlewareTests.PhiPath_PublishesToEventHubWhenPresent

11 passed, 0 failed
```

This is the stand-in's answer to "did the existing tests pass before the change". The characterization record (`characterization.yml`) stays at `not-run` until the solution's own test project runs them (T005).

## Seeded defects

`run.py --repo . --seed --base 8d04df3`: each defect is put into a temporary copy of the middleware, one at a time, and the tests are run. The last one puts the nine services back in the order they have at `8d04df3`.

```
Unseeded: 49 passed, 0 failed

D1 the user is taken from the oid claim, as before the change
   caught by 13 test(s): AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller, PhiPath_DoesNotTakeTheUserFromTheOidClaim, PhiPath_IgnoresAUserNamedInARequestHeader, PhiPath_PersistsAuditEntryWithCorrectFields, PhiPath_RecordsTheIdentityThePipelineEndedWith, PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity, PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim, ResolveUserId_PrefersTheSubClaimToTheMappedOne, TwoCallers_EachRecordNamesItsOwnCaller, ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject, ValidToken_TheRecordNamesTheTokensSubject
D2 the identity is read only before the rest of the pipeline runs
   caught by 2 test(s): AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller, PhiPath_RecordsTheIdentityThePipelineEndedWith
D3 an unauthenticated request is recorded as anonymous
   caught by 1 test(s): PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity
D4 an identity with no subject is recorded as unauthenticated
   caught by 3 test(s): PhiPath_DoesNotTakeTheUserFromTheOidClaim, ResolveUserId_TreatsABlankSubjectAsNoSubject
D5 the claims of an identity that is not authenticated are trusted
   caught by 11 test(s): ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated, AnEndpointWithNoGuard_ServedWithoutAToken_IsRecordedAsUnauthenticatedWithItsStatus, AnExpiredToken_IsRefusedAndRecordedAsUnauthenticated, NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, NoToken_TheRequestIsRefusedAndStillRecorded, PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity, PhiPath_LogsInformationTwice, PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity, ResolveUserId_TreatsAMissingPrincipalAsUnauthenticated
D6 the mapped name-identifier claim is not read
   caught by 1 test(s): PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim
D7 a request header may name the user when there is no identity
   caught by 2 test(s): NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity
D8 a refused request is not recorded
   caught by 6 test(s): ATokenTheSchemeDoesNotAccept_IsRefusedAndRecordedAsUnauthenticated, AnExpiredToken_IsRefusedAndRecordedAsUnauthenticated, NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, NoToken_TheRequestIsRefusedAndStillRecorded
D9 the services start in the order they have at 8d04df3
   caught by 9 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization

9 of 9 seeded defects caught
```

## AC-006 and NFR-001

- AC-006: the 14 code files this change adds or edits were searched for a path under a `Migrations` folder and for `AuditDbContext.cs`. Matches: 0.
- NFR-001: the middleware awaits nothing new. The identity is read from the request's principal in memory; the write to the audit table is started after the response and is not awaited, as before.

Files searched:

```
src/HealthQCopilot.Agents/Program.cs
src/HealthQCopilot.Fhir/Program.cs
src/HealthQCopilot.Identity/Program.cs
src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs
src/HealthQCopilot.Notifications/Program.cs
src/HealthQCopilot.Ocr/Program.cs
src/HealthQCopilot.PopulationHealth/Program.cs
src/HealthQCopilot.RevenueCycle/Program.cs
src/HealthQCopilot.Scheduling/Program.cs
src/HealthQCopilot.Voice/Program.cs
tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrder.cs
tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrderTests.cs
tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs
tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditPipelineTests.cs
```
