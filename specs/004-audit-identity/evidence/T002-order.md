# T002: the order in the nine services

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5
- **Assumptions:** none
- **Unverified:** no service was built or started. The table is read from the text of each `Program.cs`; the test that fails the build on a wrong order is T004

## From authentication or the audit, whichever is first, to authorization

Line numbers in brackets. Read by a script from `git show 8d04df3:<file>` and from the working copy.

| Service | On `main` at `8d04df3` | In this change |
|---|---|---|
| Agents | **audit** (391), IdempotencyMiddleware (392), **authentication** (393), authorization (394) | **authentication** (391), **audit** (394), IdempotencyMiddleware (395), authorization (396) |
| Fhir | **audit** (84), ConsentEnforcementMiddleware (85), **authentication** (86), authorization (87) | **authentication** (85), **audit** (87), authorization (88) |
| Identity | **audit** (64), **authentication** (65), authorization (66) | **authentication** (64), **audit** (66), authorization (67) |
| Notifications | **audit** (56), **authentication** (57), authorization (58) | **authentication** (56), **audit** (58), authorization (59) |
| Ocr | **audit** (47), **authentication** (48), authorization (49) | **authentication** (47), **audit** (49), authorization (50) |
| PopulationHealth | **audit** (73), **authentication** (74), authorization (75) | **authentication** (73), **audit** (75), authorization (76) |
| RevenueCycle | **audit** (63), **authentication** (64), authorization (65) | **authentication** (63), **audit** (65), authorization (66) |
| Scheduling | **audit** (56), **authentication** (57), authorization (58) | **authentication** (56), **audit** (58), authorization (59) |
| Voice | **audit** (57), **authentication** (58), authorization (59) | **authentication** (57), **audit** (59), authorization (60) |

In seven services the two lines swap. In the agent service the authentication line moves up, so that the audit stays outside the idempotency middleware. In the FHIR service the audit line moves down, below the consent middleware and authentication. The plan gives the reason for each.

## What changed

```
 src/HealthQCopilot.Agents/Program.cs           | 4 +++-
 src/HealthQCopilot.Fhir/Program.cs             | 3 ++-
 src/HealthQCopilot.Identity/Program.cs         | 3 ++-
 src/HealthQCopilot.Notifications/Program.cs    | 3 ++-
 src/HealthQCopilot.Ocr/Program.cs              | 3 ++-
 src/HealthQCopilot.PopulationHealth/Program.cs | 3 ++-
 src/HealthQCopilot.RevenueCycle/Program.cs     | 3 ++-
 src/HealthQCopilot.Scheduling/Program.cs       | 3 ++-
 src/HealthQCopilot.Voice/Program.cs            | 3 ++-
 9 files changed, 19 insertions(+), 9 deletions(-)
```

Each file gains one comment line above the audit registration, and the agent service a second one.

## Formatting

`dotnet format whitespace --folder --verify-no-changes --include <the ten changed C# files>` reported `Formatted 0 of 10 files` and exit status 0, under this repository's `.editorconfig`. The style and analyzer parts of `dotnet format` need the restored solution and were not run.
