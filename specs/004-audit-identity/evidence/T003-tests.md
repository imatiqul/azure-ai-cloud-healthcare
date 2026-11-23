# T003: the rewritten tests and the pipeline tests

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, QLT-3, TRC-2
- **Assumptions:** the stand-ins named below behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested, because the package registry cannot be reached from where this ran. This is not a run of `tests/HealthQCopilot.Tests.Unit`. The xUnit analyzers, which the real build runs with warnings as errors, did not run

## What was run

`python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .`, with .NET SDK 10.0.115 and ASP.NET Core 10.0.15.

It compiles the real middleware and the real test files under this repository's `Directory.Build.props` (warnings are errors) and runs every `[Fact]` and `[Theory]` row. The request pipeline in `PhiAuditPipelineTests` is the framework's own: `UseAuthentication`, the audit middleware, `UseAuthorization`. What is stood in for is xUnit's attributes, the FluentAssertions and NSubstitute calls the tests make, and EF Core's in-memory provider.

## What changed in the tests

- `PhiAuditMiddlewareTests.cs`: the two tests that asserted the old behaviour are replaced by seven that assert the new one, and three that test `ResolveUserId` directly. `PhiPath_PersistsAuditEntryWithCorrectFields` keeps its assertions and sets its user up as a subject. The other eight tests are unchanged.
- `PhiAuditPipelineTests.cs`, new: AC-002 (a valid token), AC-003 (a token and an `X-User-Id` header naming another user, nobody, or the caller), AC-004 (no token, a token the scheme does not know, an expired token: each refused with 401 and each recorded with the marker), an endpoint with no guard, two callers, and the old order.

## Result

```
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

33 passed, 0 failed
```

## Criteria to tests

| Criterion | Tests |
|---|---|
| AC-002 | `PhiAuditPipelineTests.ValidToken_TheRecordNamesTheTokensSubject`; `PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity`, `..._WhenItArrivesAsTheMappedNameIdentifierClaim` |
| AC-003 | `PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject` (three rows); `PhiAuditMiddlewareTests.PhiPath_IgnoresAUserNamedInARequestHeader` |
| AC-004 | `PhiAuditPipelineTests.NoToken_TheRequestIsRefusedAndStillRecorded`, `ATokenTheSchemeDoesNotAccept_...` (three rows), `AnExpiredToken_...`, `NoTokenAndAHeaderNamingAUser_...` |

AC-001 and AC-005 are T004.
