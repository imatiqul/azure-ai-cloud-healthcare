# Tasks: 004-audit-identity

Draft, waiting at gate G4. One task list for one pull request. `[P]` marks a task that may run beside its neighbours.

- [ ] T001 [P] Change `src/HealthQCopilot.Infrastructure/Middleware/PhiAuditMiddleware.cs`: the user is the subject of the authenticated identity; a marker where there is none @backend-implementer. Carries: AC-002, AC-003, AC-004
- [ ] T002 [P] Put the audit middleware between authentication and authorization in `src/HealthQCopilot.Agents/Program.cs`, `src/HealthQCopilot.Fhir/Program.cs`, `src/HealthQCopilot.Identity/Program.cs`, `src/HealthQCopilot.Notifications/Program.cs`, `src/HealthQCopilot.Ocr/Program.cs`, `src/HealthQCopilot.PopulationHealth/Program.cs`, `src/HealthQCopilot.RevenueCycle/Program.cs`, `src/HealthQCopilot.Scheduling/Program.cs` and `src/HealthQCopilot.Voice/Program.cs`, each as the plan's table says @backend-implementer. Carries: AC-001
- [ ] T003 [P] Rewrite the tests that assert the old behaviour in `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditMiddlewareTests.cs` and add `tests/HealthQCopilot.Tests.Unit/Infrastructure/PhiAuditPipelineTests.cs` @test-agent. Carries: AC-002, AC-003, AC-004
- [ ] T004 [P] Add `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrderTests.cs` and the helper it uses, `tests/HealthQCopilot.Tests.Unit/Architecture/RequestPipelineOrder.cs` @test-agent. Carries: AC-001, AC-005
- [ ] T005 Run the eleven existing tests of the audit middleware at the base commit, then the unit test project at the change's commit, and record both in `specs/004-audit-identity/evidence/characterization.yml` and `specs/004-audit-identity/evidence/unit-tests.md` @test-agent. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
- [ ] T006 Verify the change against the spec, the constitution and the system map, with none of the author's notes, and write `specs/004-audit-identity/verification/G6-report.md` @independent-verifier. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006

T005 needs a machine that can restore the solution's packages. The run at the base commit can be made at any time, because the base commit does not change; what the kit checks is that the tests ran against code this spec had not yet touched.
