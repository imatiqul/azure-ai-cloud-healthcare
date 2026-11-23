# T003, first rework round: the tests of the middleware

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, AGT-6, QLT-7
- **Assumptions:** the stand-ins behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested. This is not a run of `tests/HealthQCopilot.Tests.Unit`, and the xUnit analyzers did not run

## Why it came back

The independent verifier returned the item for V-3 and V-4 (`verification/G6-report.md`): it seeded seven further defects and five passed every test. The security reviewer asked for points 1 to 3 of S-9 and for the tests S-8 needs (`reviews/G5-security.md`).

## What changed

| Finding | Tests added or changed |
|---|---|
| V-3, S-9 point 1: nothing checked the user in the event | `PhiPath_TheEventNamesTheSameUserAsTheRecord`, `PhiPath_TheEventOfAnUnauthenticatedRequestCarriesTheMarker`; every pipeline test now compares the events with the rows |
| V-3: nothing checked the user in the log lines | `PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader`, `PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith`, `PhiPath_AFailedWriteIsLoggedWithWhatTheLostRowHeld`; the header rows of the pipeline tests read the two lines |
| V-4, S-9 point 2: a 403 was not tested | `ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject` |
| V-4: the markers' text was not pinned | `TheMarkersAreTheTextThePlanFixes`; the no-token pipeline test compares with the literal |
| V-4: every subject was lower-case | `PhiPath_RecordsTheSubjectExactlyAsTheTokenCarriesIt`; the valid-token pipeline test uses a mixed-case subject |
| V-4: the "token the scheme does not accept" rows took the no-token path | Renamed to say so (`ACredentialTheSchemeDoesNotKnow_...`). `ATokenTheSchemeRejects_...` has two rows, expired and malformed, where the scheme reads the token and fails it |
| V-4: the time and the correlation id were not checked | `PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId` |
| S-9 point 3: the tests for AC-003 ran without the code that reads the header | The pipeline now starts with the tenant-context middleware, as eight of the nine services do |
| S-8: a principal with two identities | `ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated`, `ResolveUserId_ReadsTheAuthenticatedIdentityWhereverItStands` |

The eight tests the plan says must not change are unchanged.

Not done here, and where it went:
- S-9 point 4, V-6: a request through a service's own host with a signed token. It needs the solution to build. The plan says the check the constitution names for P-9 is not built by this change; the rollout's staging stage reads a row back from each service.
- S-9 point 5: the fixed wait of 150 ms in the older tests is as it was. The new pipeline tests poll.

## Result

`python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .`, with the middleware as reworked in T001 and the order tests as first handed off:

```
PASS  PhiAuditMiddlewareTests.PhiPath_AFailedWriteIsLoggedWithWhatTheLostRowHeld
PASS  PhiAuditMiddlewareTests.PhiPath_PersistsTheStatusTheTimeAndTheCorrelationId
PASS  PhiAuditMiddlewareTests.PhiPath_RecordsTheSubjectExactlyAsTheTokenCarriesIt
PASS  PhiAuditMiddlewareTests.PhiPath_TheCompletionLineNamesTheIdentityThePipelineEndedWith
PASS  PhiAuditMiddlewareTests.PhiPath_TheEventNamesTheSameUserAsTheRecord
PASS  PhiAuditMiddlewareTests.PhiPath_TheEventOfAnUnauthenticatedRequestCarriesTheMarker
PASS  PhiAuditMiddlewareTests.PhiPath_TheLogLinesNameTheUserOfTheRecordAndNotAHeader
PASS  PhiAuditMiddlewareTests.ResolveUserId_DoesNotReadASubjectFromAnIdentityThatIsNotAuthenticated
PASS  PhiAuditMiddlewareTests.ResolveUserId_ReadsTheAuthenticatedIdentityWhereverItStands
PASS  PhiAuditMiddlewareTests.TheMarkersAreTheTextThePlanFixes
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("Bearer not-a-token-this-scheme-knows")
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("Test")
PASS  PhiAuditPipelineTests.ACredentialTheSchemeDoesNotKnow_IsRefusedAndRecordedAsUnauthenticated("")
PASS  PhiAuditPipelineTests.ASignedInCallerWithoutTheRole_IsRefusedAndRecordedUnderTheirOwnSubject
PASS  PhiAuditPipelineTests.ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated("Test expired:clinician-7")
PASS  PhiAuditPipelineTests.ATokenTheSchemeRejects_IsRefusedAndRecordedAsUnauthenticated("Test malformed:%%%")

61 passed, 0 failed
```

Only the tests this round adds or renames are listed; the full list is in T004's rework, with the seeded defects.
