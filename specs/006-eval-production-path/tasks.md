# Tasks: 006-eval-production-path

Draft, waiting at gate G4.

- [ ] T001 Record the characterization run in `specs/006-eval-production-path/evidence/characterization.yml`: the existing harness and gate tests, at the base commit, with what they report @test-agent. Carries: AC-009
- [ ] T002 Rewrite `tests/HealthQCopilot.Tests.Eval/ClinicalAccuracyHarnessTests.cs` to call the production classifier, compare with the label, refuse an unsigned set and write the result file @ai-implementer. Carries: AC-001, AC-002, AC-003, AC-005
- [ ] T003 Add `tests/HealthQCopilot.Tests.Eval/HarnessSelfTests.cs` with the two wrong classifiers, and remove `tests/HealthQCopilot.Tests.Unit/Agents/AgentEvalCiGateTests.cs` @test-agent. Carries: AC-002, AC-003, AC-005, AC-009
- [ ] T004 Extend `tests/HealthQCopilot.Tests.Eval/GoldenSets/triage.json` to the plan's counts, with a version and the signing clinician, and add the counting test @ai-implementer. Carries: AC-004
- [ ] T005 Change `.github/workflows/agent-eval.yml`: run the evaluation project, widen the path filters, compare with the thresholds and with the recorded result @release-agent. Carries: AC-006, AC-007, AC-008
- [ ] T006 Verify the change against the spec, the constitution and the system map, and write `specs/006-eval-production-path/verification/G6-report.md` @independent-verifier. Carries: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009
