# T004, first rework round: the order check

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, AGT-6, QLT-7
- **Assumptions:** the stand-ins behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested. This is not a run of `tests/HealthQCopilot.Tests.Unit`. The seeded defects are a check on the tests, not a mutation score

## Why it came back

The independent verifier returned the item for V-5 (`verification/G6-report.md`): a tenth service in the old order passed every test in two ways, nothing in front of authentication was examined, and a registration in a block comment, a condition or a second form passed. The security reviewer required point 1 of S-10 (`reviews/G5-security.md`).

`T004-order-tests.md` said the census "compares the list with the nine rows, so a tenth service cannot be added unchecked". That was wrong, as the verifier showed. The file now says so at that sentence.

## What changed

| The verifier's case | Before | Now |
|---|---|---|
| X2: a tenth service in the old order, its name added to the list of audited services | All tests passed | The order rows and the census read one list, so the new name is a row, and the row fails |
| X3, O6, O7: the middleware registered by type, or through an extension method | Invisible to the census | The census counts any `Program.cs` that names the middleware in any form; a second test fails when any other file under `src/` names it |
| O4, S-10 point 1: a middleware that can refuse sits in front of authentication | Not examined | Everything registered in front of the audit has to be on a short list, each entry with the reason it cannot answer a request. The FHIR consent middleware is on it as an exception for that service only, with its reason |
| O5: `app.MapWhen(...)` or `app.Run(...)` between authentication and the audit | Passed | Nothing may sit between the two |
| O1: the registration inside a block comment | Counted as registered | Block comments are removed before reading |
| O3: a preprocessor condition | Passed | A `Program.cs` with one fails |
| O2, O12: a registration inside a condition or a method that is never called | Counted | Only a top-level statement counts; one inside a block fails and says so |
| O10, O11: a second registration | The first one was used | Fails |
| O8, O9: another builder name, or the three chained in one statement | "not registered" | The same. It is a false alarm, in the safe direction |

What the check still cannot see, as its own comment says: a middleware on the list that is changed so that it answers requests; a service that should audit and never names the middleware (the gateway and the bff today); and whether a test run happens at all. No workflow has run the unit tests since May 2026, so FR-004's "the build MUST fail" has no build to fail in until one does.

## Every test of the change

`python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .`

```
PASS  RequestPipelineOrderTests.AChainedRegistrationFails
PASS  RequestPipelineOrderTests.AMiddlewareBetweenTheAuditAndAuthorizationIsAllowed
PASS  RequestPipelineOrderTests.AMiddlewareInFrontOfAuthenticationThatIsNotOnTheListFails("app.UseMiddleware<ConsentEnforcementMiddleware>();")
PASS  RequestPipelineOrderTests.AMiddlewareInFrontOfAuthenticationThatIsNotOnTheListFails("app.UseHealthcareRateLimiting();")
PASS  RequestPipelineOrderTests.AMiddlewareInFrontOfAuthenticationThatIsNotOnTheListFails("app.UseOutputCache();")
PASS  RequestPipelineOrderTests.AMissingAuthenticationOrAuthorizationFails
PASS  RequestPipelineOrderTests.APreprocessorConditionFails
PASS  RequestPipelineOrderTests.ARegistrationInAnotherFormIsNotRead("app.UseMiddleware(typeof(PhiAuditMiddleware));")
PASS  RequestPipelineOrderTests.ARegistrationInAnotherFormIsNotRead("app.UsePhiAudit();")
PASS  RequestPipelineOrderTests.ARegistrationInsideABlockFails
PASS  RequestPipelineOrderTests.ARegistrationThatIsCommentedOutOrMissingDoesNotCount("// app.UseMiddleware<PhiAuditMiddleware>();")
PASS  RequestPipelineOrderTests.ARegistrationThatIsCommentedOutOrMissingDoesNotCount("/* app.UseMiddleware<PhiAuditMiddleware>(); */")
PASS  RequestPipelineOrderTests.ARegistrationThatIsCommentedOutOrMissingDoesNotCount("")
PASS  RequestPipelineOrderTests.ASecondRegistrationFails
PASS  RequestPipelineOrderTests.AnythingBetweenAuthenticationAndTheAuditFails("app.UseMiddleware<IdempotencyMiddleware>();")
PASS  RequestPipelineOrderTests.AnythingBetweenAuthenticationAndTheAuditFails("app.MapWhen(context => true, branch => branch.Run(Refuse));")
PASS  RequestPipelineOrderTests.AnythingBetweenAuthenticationAndTheAuditFails("app.Run(Refuse);")
PASS  RequestPipelineOrderTests.AuditAfterAuthorizationFails
PASS  RequestPipelineOrderTests.AuditBeforeAuthenticationFailsAndNamesTheService
PASS  RequestPipelineOrderTests.EveryServiceThatNamesTheAuditMiddlewareIsChecked
PASS  RequestPipelineOrderTests.NamingTheMiddlewareInACommentIsNotNamingIt
PASS  RequestPipelineOrderTests.TheAuditMiddlewareIsRegisteredNowhereButInAProgramFile
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Agents")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Fhir")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Identity")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Notifications")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Ocr")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("PopulationHealth")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("RevenueCycle")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Scheduling")
PASS  RequestPipelineOrderTests.TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization("Voice")
PASS  RequestPipelineOrderTests.TheConsentMiddlewareIsToleratedInTheFhirServiceOnly
PASS  RequestPipelineOrderTests.TheMiddlewareNamedASecondTimeFails
PASS  RequestPipelineOrderTests.TheRightOrderPasses
PASS  RequestPipelineOrderTests.WhatMaySitInFrontOfTheAuditIsWrittenDownWithAReason
PASS  PhiAuditMiddlewareTests.NonPhiPath_CallsNextWithoutLogging
PASS  PhiAuditMiddlewareTests.NonPhiPath_DoesNotPublishToEventHub
PASS  PhiAuditMiddlewareTests.PhiPath_AFailedWriteIsLoggedWithWhatTheLostRowHeld
PASS  PhiAuditMiddlewareTests.PhiPath_AlwaysCallsNext
PASS  PhiAuditMiddlewareTests.PhiPath_CaseInsensitivePathMatching
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotTakeTheUserFromTheOidClaim
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotThrowWhenEventHubIsNull
PASS  PhiAuditMiddlewareTests.PhiPath_IgnoresAUserNamedInARequestHeader
PASS  PhiAuditMiddlewareTests.PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity
PASS  PhiAuditMiddlewareTests.PhiPath_LogsInformationTwice
PASS  PhiAuditMiddlewareTests.PhiPath_PersistenceExceptionIsSwallowedAndLogged
PASS  PhiAuditMiddlewareTests.PhiPath_PersistsAuditEntryWithCorrectFields
PASS  PhiAuditMiddlewareTests.PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId
PASS  PhiAuditMiddlewareTests.PhiPath_PublishesToEventHubWhenPresent
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheIdentityThePipelineEndedWith
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectExactlyAsTheTokenCarriesIt
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity
PASS  PhiAuditMiddlewareTests.PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith
PASS  PhiAuditMiddlewareTests.PhiPath_TheEventNamesTheSameUserAsTheRecord
PASS  PhiAuditMiddlewareTests.PhiPath_TheEventOfAnUnauthenticatedRequestCarriesTheMarker
PASS  PhiAuditMiddlewareTests.PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader
PASS  PhiAuditMiddlewareTests.ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated
PASS  PhiAuditMiddlewareTests.ResolveUserId_PrefersTheSubClaimToTheMappedOne
PASS  PhiAuditMiddlewareTests.ResolveUserId_ReadsTheAuthenticatedIdentityWhereverItStands
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsABlankSubjectAsNoSubject("")
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsABlankSubjectAsNoSubject("   ")
PASS  PhiAuditMiddlewareTests.ResolveUserId_TreatsAMissingPrincipalAsUnauthenticated
PASS  PhiAuditMiddlewareTests.TheMarkersAreTheTextThePlanFixes
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("Bearer not-a-token-this-scheme-knows")
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("Test")
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("")
PASS  PhiAuditPipelineTests.ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject
PASS  PhiAuditPipelineTests.ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated("Test expired:clinician-7")
PASS  PhiAuditPipelineTests.ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated("Test malformed:%%%")
PASS  PhiAuditPipelineTests.AnEndpointWithNoGuard_ServedWithoutAToken_IsRecordedAsUnauthenticatedWithItsStatus
PASS  PhiAuditPipelineTests.AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller
PASS  PhiAuditPipelineTests.NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated
PASS  PhiAuditPipelineTests.NoToken_TheRequestIsRefusedAndStillRecorded
PASS  PhiAuditPipelineTests.TwoCallers_EachRecordNamesItsOwnCaller
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("user-v")
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("")
PASS  PhiAuditPipelineTests.ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject("user-u")
PASS  PhiAuditPipelineTests.ValidToken_TheRecordNamesTheTokensSubject

80 passed, 0 failed
```

## Seeded defects

`run.py --repo . --seed --base 8d04df3`. D1 to D8 and O1 are the author's from before the reviews. D9 to D16 and O2 to O8 were added in this round from the two reviewers' reports; five of them (D9, D10, D11, D13, D14) are the ones the verifier showed passing every test.

```
Unseeded: 80 passed, 0 failed

D1 the user is taken from the oid claim, as before the change
   caught by 22 test(s): ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject, AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller, PhiPath_AFailedWriteIsLoggedWithWhatTheLostRowHeld, PhiPath_DoesNotTakeTheUserFromTheOidClaim, PhiPath_IgnoresAUserNamedInARequestHeader, PhiPath_PersistsAuditEntryWithCorrectFields, PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId, PhiPath_RecordsTheIdentityThePipelineEndedWith, PhiPath_RecordsTheSubjectExactlyAsTheTokenCarriesIt, PhiPath_RecordsTheSubjectOfTheAuthenticatedIdentity, PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim, PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith, PhiPath_TheEventNamesTheSameUserAsTheRecord, PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader, ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated, ResolveUserId_PrefersTheSubClaimToTheMappedOne, ResolveUserId_ReadsTheAuthenticatedIdentityWhereverItStands, TwoCallers_EachRecordNamesItsOwnCaller, ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject, ValidToken_TheRecordNamesTheTokensSubject
D2 the identity is read only before the rest of the pipeline runs
   caught by 3 test(s): AuditRegisteredBeforeAuthentication_TheRecordStillNamesTheCaller, PhiPath_RecordsTheIdentityThePipelineEndedWith, PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith
D3 an unauthenticated request is recorded as anonymous
   caught by 4 test(s): NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, NoToken_TheRequestIsRefusedAndStillRecorded, PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity, TheMarkersAreTheTextThePlanFixes
D4 an identity with no subject is recorded as unauthenticated
   caught by 4 test(s): PhiPath_DoesNotTakeTheUserFromTheOidClaim, ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated, ResolveUserId_TreatsABlankSubjectAsNoSubject
D5 the claims of an identity that is not authenticated are read
   caught by 16 test(s): ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated, ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated, AnEndpointWithNoGuard_ServedWithoutAToken_IsRecordedAsUnauthenticatedWithItsStatus, NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, NoToken_TheRequestIsRefusedAndStillRecorded, PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity, PhiPath_LogsInformationTwice, PhiPath_RecordsTheUnauthenticatedMarkerWhenThereIsNoIdentity, PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith, PhiPath_TheEventOfAnUnauthenticatedRequestCarriesTheMarker, ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated, ResolveUserId_ReadsTheAuthenticatedIdentityWhereverItStands, ResolveUserId_TreatsAMissingPrincipalAsUnauthenticated
D6 the mapped name-identifier claim is not read
   caught by 1 test(s): PhiPath_RecordsTheSubjectWhenItArrivesAsTheMappedNameIdentifierClaim
D7 a request header may name the user when there is no identity
   caught by 2 test(s): NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, PhiPath_IgnoresAUserNamedInARequestHeaderWhenThereIsNoIdentity
D8 a request refused with 401 is not recorded
   caught by 7 test(s): ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated, ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated, NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, NoToken_TheRequestIsRefusedAndStillRecorded
D9 a request refused with 403 is not recorded
   caught by 2 test(s): ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject, PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId
D10 the event names the user a request header gives
   caught by 4 test(s): NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, PhiPath_TheEventNamesTheSameUserAsTheRecord, ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject
D11 the first log line names the user a request header gives
   caught by 3 test(s): PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader, ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject
D12 the completion log line names the user a request header gives
   caught by 4 test(s): NoTokenAndAHeaderNamingAUser_TheRecordStillSaysUnauthenticated, PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader, ValidTokenAndAHeaderNamingAUser_TheRecordNamesTheTokensSubject
D13 the subject is lower-cased before it is recorded
   caught by 2 test(s): PhiPath_RecordsTheSubjectExactlyAsTheTokenCarriesIt, ValidToken_TheRecordNamesTheTokensSubject
D14 the record's time and correlation id are not stored
   caught by 1 test(s): PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId
D15 the mapped name-identifier claim is preferred to sub
   caught by 1 test(s): ResolveUserId_PrefersTheSubClaimToTheMappedOne
D16 the line for a failed write does not name the user
   caught by 1 test(s): PhiPath_AFailedWriteIsLoggedWithWhatTheLostRowHeld
O2 a tenth service audits before authentication
   caught by 1 test(s): EveryServiceThatNamesTheAuditMiddlewareIsChecked
O3 a tenth service audits before authentication and registers the middleware by its type
   caught by 1 test(s): EveryServiceThatNamesTheAuditMiddlewareIsChecked
O4 a tenth service audits before authentication and its name is added to the list of audited services
   caught by 1 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization
O5 a middleware that can refuse a request is put in front of authentication in one service
   caught by 1 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization
O6 one service registers the audit through an extension method in another file
   caught by 3 test(s): EveryServiceThatNamesTheAuditMiddlewareIsChecked, TheAuditMiddlewareIsRegisteredNowhereButInAProgramFile, TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization
O7 one service registers the audit after authorization
   caught by 1 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization
O8 one service registers authentication inside a condition
   caught by 1 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization
O1 the nine services start in the order they have at 8d04df3
   caught by 9 test(s): TheAuditMiddlewareRunsDirectlyAfterAuthenticationAndBeforeAuthorization

24 of 24 seeded defects caught
```
