# T005: the solution's own test runs

- **Phase and date:** Phase 7, task T005; 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, `main` at `2a8f516` and the base commit `8d04df3`
- **Requirement IDs exercised:** QLT-7, QLT-9, AGT-5
- **Assumptions:** the two results files are what the two commands below wrote. Their names, their times and the repository's checkout history agree with that; nobody watched the runs but the owner
- **Unverified:** the integration, architecture, evaluation and application-host test projects were not run. No coverage and no mutation score were measured. The results files themselves are not in the repository

The owner ran the tests on his own machine. The agent that wrote this file did not run them and cannot: it has no access to the package registry. It read the two results files in the owner's folder and copied nothing from them but what is below. The files also hold the name of the machine and of the user, which are left out.

## What was run

```powershell
# on main, at 2a8f516
dotnet test tests/HealthQCopilot.Tests.Unit --logger "trx;LogFileName=unit.trx"

# at the base commit, before this spec changed anything
git switch --detach 8d04df3
dotnet test tests/HealthQCopilot.Tests.Unit --filter "FullyQualifiedName~PhiAuditMiddlewareTests" -p:NuGetAudit=false --logger "trx;LogFileName=base.trx"
git switch main
```

The second command switches NuGet's advisory audit off for that run. At `8d04df3` ten packages have published advisories and the build treats warnings as errors, so nothing restores there otherwise. Pull request #76 dealt with seven of them, which is why the first command needs no such switch for this project.

## Results

| Run | Commit | Started (local time, UTC-6) | Tests | Passed | Failed | Not run | Results file, SHA-256 |
|---|---|---|---|---|---|---|---|
| The unit test project | `2a8f516` | 2026-11-22 20:08:40 | 520 | 520 | 0 | 0 | `005eace98b9d3d034fb1cc10b146a2472a0594662484d84661b5a2c9ca1ebc46` |
| The eleven tests that pinned the old behaviour | `8d04df3` | 2026-11-22 20:09:17 | 11 | 11 | 0 | 0 | `b3f055df1dc6a4c802eadd4e600e2d05f39d464629f5048f2760190cb36e9e7b` |

In the first run, the tests this spec wrote or rewrote:

| Class | Tests | Passed |
|---|---|---|
| `PhiAuditMiddlewareTests` | 30 | 30 |
| `PhiAuditPipelineTests` | 15 | 15 |
| `RequestPipelineOrderTests` | 35 | 35 |
| | 80 | 80 |

In the second run, by name: `NonPhiPath_CallsNextWithoutLogging`, `NonPhiPath_DoesNotPublishToEventHub`, `PhiPath_AlwaysCallsNext`, `PhiPath_CaseInsensitivePathMatching`, `PhiPath_DoesNotThrowWhenEventHubIsNull`, `PhiPath_ExtractsUserIdFromOidClaim`, `PhiPath_FallsBackToAnonymousWhenNoOidClaim`, `PhiPath_LogsInformationTwice`, `PhiPath_PersistenceExceptionIsSwallowedAndLogged`, `PhiPath_PersistsAuditEntryWithCorrectFields`, `PhiPath_PublishesToEventHubWhenPresent`.

## What this shows

- **The change compiles as part of the solution.** The test project references all nine services the change touches, so building it builds them, with the solution's own packages, its analyzers, and warnings treated as errors. The stand-in runs of T001 to T004 could not show that.
- **The 80 tests pass against the real test libraries.** The stand-in runs reported the same 80 (`T004-rework-1.md`) and the same 11 at the base commit (`T004-order-tests.md`). The stand-ins did not hide a failure.
- **The other 440 tests of the project still pass** with the change and with the package versions of pull request #76.
- **The old behaviour was pinned before it was changed.** The eleven tests pass on code this spec had not touched. Three of them fail on the changed middleware by design and were rewritten in T003; `T001-middleware.md` names them.

## What it does not show

- **`main` at `2a8f516` is not the commit the change was reviewed at** (`1e8d054`; it was `12ff77d` where the change was written). Two merges lie between: the proposals of pull request #75 and the package versions of pull request #76. No `.cs` file differs between `1e8d054` and `2a8f516`, so the code and the tests that ran are the ones that were reviewed; the packages under them are newer.
- **Nothing ran against a database, an identity provider or a deployed service.** These are unit tests.
- **No pipeline ran any of it.** No workflow of this repository has started since May 2026.
- **The independent verification has not been repeated on these results.** That is task T006.
