# Tasks: 003-identity-from-token

Draft, waiting at gate G4. T007 cannot start until the spec's `touches` includes the agent service.

- [ ] T001 List every client that sends `X-Tenant-Id` or `X-User-Id`, in `specs/003-identity-from-token/evidence/header-senders.md` @impact-analyst. Carries: AC-002
- [ ] T002 Add the caller context and change `src/HealthQCopilot.Infrastructure/Middleware/TenantContextMiddleware.cs` and `src/HealthQCopilot.Infrastructure/Middleware/RateLimitingExtensions.cs` @backend-implementer. Carries: AC-001, AC-002, AC-005
- [ ] T003 Update `tests/HealthQCopilot.Tests.Unit/Infrastructure/TenantContextMiddlewareTests.cs` and add pipeline tests beside it @test-agent. Carries: AC-001, AC-002, AC-005
- [ ] T004 Change `src/HealthQCopilot.Identity/Endpoints/BreakGlassEndpoints.cs`: requester from the token, a named policy on the group @backend-implementer. Carries: AC-003, AC-004
- [ ] T005 Add break-glass tests to `tests/HealthQCopilot.Tests.Integration/IdentityEndpointTests.cs` @test-agent. Carries: AC-003, AC-004
- [ ] T006 [P] Add `tests/HealthQCopilot.Tests.Unit/Architecture/CallerAssertedIdentityTests.cs` @test-agent. Carries: AC-006
- [ ] T007 Replace the three header reads in `src/HealthQCopilot.Agents/Services/GuideOrchestrator.cs` and `src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs` with the caller context @backend-implementer. Carries: AC-001
- [ ] T008 Verify the change against the spec, the constitution and the system map, and write `specs/003-identity-from-token/verification/G6-report.md` @independent-verifier. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
