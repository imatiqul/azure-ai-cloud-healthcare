# Tasks: 001-fail-closed-auth

Draft, waiting at gate G4.

- [ ] T001 List every deployment that runs with no identity provider today, from the platform, and record it in `specs/001-fail-closed-auth/evidence/demo-mode-deployments.md` @release-agent. Carries: AC-005
- [ ] T002 Change `src/HealthQCopilot.Infrastructure/Auth/JwtBearerExtensions.cs` and add `src/HealthQCopilot.Infrastructure/Auth/AuthenticationStartupCheck.cs`: the setting, the start-up check, the log line @backend-implementer. Carries: AC-001, AC-002, AC-003, AC-004, AC-006
- [ ] T003 Add `tests/HealthQCopilot.Tests.Unit/Infrastructure/AuthenticationStartupCheckTests.cs` @test-agent. Carries: AC-001, AC-002, AC-003, AC-004, AC-006
- [ ] T004 [P] Make the deploy job fail when the identity provider variables are unset, in `.github/workflows/microservice-deploy.yml` @release-agent. Carries: AC-005
- [ ] T005 [P] Add `tests/HealthQCopilot.Tests.Unit/Architecture/AuthenticatedIdentitySourcesTests.cs` @test-agent. Carries: AC-007
- [ ] T006 Verify the change against the spec, the constitution and the system map, and write `specs/001-fail-closed-auth/verification/G6-report.md` @independent-verifier. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
