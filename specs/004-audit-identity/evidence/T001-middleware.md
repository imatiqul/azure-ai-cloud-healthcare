# T001: the changed middleware against the tests as they were

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, QLT-3
- **Assumptions:** the stand-ins named below behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested, because the package registry cannot be reached from where this ran. This is not a run of `tests/HealthQCopilot.Tests.Unit`

## What was run

`python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .`, with .NET SDK 10.0.115 and ASP.NET Core 10.0.15.

It compiles the real `PhiAuditMiddleware.cs` and the real `PhiAuditMiddlewareTests.cs` under this repository's `Directory.Build.props` (warnings are errors) against the real ASP.NET Core framework, with small stand-ins for the four packages the tests use (xUnit, FluentAssertions, NSubstitute, EF Core's in-memory provider), and runs the tests.

## State of the working copy

Only `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs` is changed. The test file is as it is on `main`.

## Result

```
PASS  PhiAuditMiddlewareTests.NonPhiPath_CallsNextWithoutLogging
PASS  PhiAuditMiddlewareTests.NonPhiPath_DoesNotPublishToEventHub
PASS  PhiAuditMiddlewareTests.PhiPath_AlwaysCallsNext
PASS  PhiAuditMiddlewareTests.PhiPath_CaseInsensitivePathMatching
PASS  PhiAuditMiddlewareTests.PhiPath_DoesNotThrowWhenEventHubIsNull
PASS  PhiAuditMiddlewareTests.PhiPath_LogsInformationTwice
PASS  PhiAuditMiddlewareTests.PhiPath_PersistenceExceptionIsSwallowedAndLogged
PASS  PhiAuditMiddlewareTests.PhiPath_PublishesToEventHubWhenPresent
FAIL  PhiAuditMiddlewareTests.PhiPath_ExtractsUserIdFromOidClaim
FAIL  PhiAuditMiddlewareTests.PhiPath_FallsBackToAnonymousWhenNoOidClaim
FAIL  PhiAuditMiddlewareTests.PhiPath_PersistsAuditEntryWithCorrectFields

8 passed, 3 failed
```

The plan said three of the eleven existing tests would have to change and eight must pass unchanged. That is what the run shows:
- `PhiPath_ExtractsUserIdFromOidClaim` and `PhiPath_FallsBackToAnonymousWhenNoOidClaim` assert the behaviour this spec removes.
- `PhiPath_PersistsAuditEntryWithCorrectFields` sets its user up through the `oid` claim; its assertions about the method and the path still hold.

The three are rewritten in T003, by the test agent. The implementer did not touch the test file.
