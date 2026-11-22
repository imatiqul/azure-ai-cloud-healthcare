# Tasks: 005-triage-validation

Draft, waiting at gate G4. Nothing here starts before G3, and G3 waits for the decisions in the plan.

- [ ] T001 Record the characterization run in `specs/005-triage-validation/evidence/characterization.yml`: the existing tests of the triage plugin and the workflow, at the base commit @test-agent. Carries: AC-008
- [ ] T002 Move the rules into one versioned file and add negation, in `src/HealthQCopilot.Agents/Plugins/TriagePlugin.cs` and `src/HealthQCopilot.Agents/Plugins/triage-rules.json` @ai-implementer. Carries: AC-001, AC-005
- [ ] T003 Pass the transcript alone to the classifier and keep retrieved text for the explanation, in `src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs` @ai-implementer. Carries: AC-003, AC-004
- [ ] T004 Add `tests/HealthQCopilot.Tests.Unit/Agents/TriageRulesTests.cs` and `tests/HealthQCopilot.Tests.Unit/Agents/TriageInputSeparationTests.cs` @test-agent. Carries: AC-003, AC-004, AC-005
- [ ] T005 Make every proposal wait for a clinician and hold no level for unclassified input, in `src/HealthQCopilot.Domain/Agents/TriageWorkflow.cs` and the handlers that publish `triage.completed` @backend-implementer. Carries: AC-006, AC-007, AC-008
- [ ] T006 Add workflow and endpoint tests in `tests/HealthQCopilot.Tests.Unit/Domain/TriageWorkflowProposalTests.cs` and `tests/HealthQCopilot.Tests.Integration/AgentEndpointTests.cs` @test-agent. Carries: AC-006, AC-007, AC-008
- [ ] T007 Run the evaluation of 006 against the signed golden set and record the result @test-agent. Carries: AC-001, AC-002
- [ ] T008 Review the separation of retrieved text and the injection tests @security-reviewer. Carries: AC-003, AC-004
- [ ] T009 Verify the change against the spec, the constitution and the system map, and write `specs/005-triage-validation/verification/G6-report.md` @independent-verifier. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
