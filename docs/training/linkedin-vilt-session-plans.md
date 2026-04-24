# Session-by-Session Lesson Plans

This document expands the 12-week course into instructor-ready weekly sessions.

For detailed slide structure and lab scripts for the first month, use [Weeks 1 to 4 Instructor Pack](linkedin-vilt-weeks-1-4-instructor-pack.md) alongside this document.

## Standard Weekly Shape

| Session | Duration | Output |
|---|---|---|
| Live lecture | 120 minutes | Architecture explanation, walkthrough, and technical framing |
| Guided lab | 90 minutes | Repo change, trace, or hands-on validation |
| Office hour | 30 minutes | Q and A, troubleshooting, and capstone coaching |
| Homework | 60 to 120 minutes | Repo reading, quiz, or implementation follow-up |

## Week 1: Platform Orientation and Environment Setup

### Repo anchors

- [../../README.md](../../README.md)
- [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs)
- [../stakeholders/README.md](../stakeholders/README.md)

### Learning goals

1. Understand the platform topology across services, frontend apps, and infrastructure.
2. Run the distributed application locally.
3. Explain why healthcare AI is taught here as a platform problem.

### Live lecture plan

1. Course framing and learner outcomes.
2. Tour the repo layout and stakeholder docs.
3. Walk the AppHost topology and infrastructure dependencies.
4. Explain the major workflow: voice to triage to human review to downstream services.

### Guided lab

1. Install prerequisites.
2. Run the AppHost and frontend shell.
3. Confirm core services and endpoints are reachable.
4. Submit a short topology diagram or notes screenshot.

### Office hour focus

- Setup issues.
- Aspire and Docker basics.
- Repo navigation questions.

### Homework

Read [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) and [../stakeholders/frontend-engineers.md](../stakeholders/frontend-engineers.md), then summarize one backend and one frontend contract boundary.

## Week 2: DDD and Backend Service Boundaries

### Repo anchors

- [../../src/HealthQCopilot.Domain](../../src/HealthQCopilot.Domain)
- [../../src/HealthQCopilot.Infrastructure](../../src/HealthQCopilot.Infrastructure)
- [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md)

### Learning goals

1. Understand bounded contexts and isolated data ownership.
2. Explain domain events and reliable backend collaboration.
3. Recognize outbox, resilience, and idempotency responsibilities.

### Live lecture plan

1. DDD boundaries in the repository.
2. Shared domain versus service ownership.
3. Event-driven collaboration and transactional outbox patterns.
4. Backend PR checklist and failure-path testing expectations.

### Guided lab

1. Trace one domain event from creation to handling.
2. Identify the service boundary it crosses.
3. Add notes on failure handling and retry safety.

### Office hour focus

- DDD questions.
- Event modeling.
- Backend test strategy.

### Homework

Write a short service-boundary review for one backend service and identify one place where tight HTTP coupling should be avoided.

## Week 3: Local Distributed Runtime with Aspire, Compose, and Dapr

### Repo anchors

- [../../src/HealthQCopilot.AppHost](../../src/HealthQCopilot.AppHost)
- [../../infra/dapr](../../infra/dapr)
- [../../docker-compose.yml](../../docker-compose.yml)

### Learning goals

1. Compare full-platform mode to service-focused mode.
2. Understand how local infra supports service development.
3. Explain the role of Dapr in local workflow testing.

### Live lecture plan

1. AppHost as the runtime composition layer.
2. Postgres, Redis, Qdrant, and HAPI FHIR dependencies.
3. Dapr components and service identity.
4. Service-focused loops for faster development.

### Guided lab

1. Run one service independently with Dapr.
2. Compare logs, env, and dependency assumptions against full-platform mode.
3. Document a local troubleshooting runbook.

### Office hour focus

- Dapr debugging.
- Service startup issues.
- Local dependency choices.

### Homework

Create a one-page note explaining when to use AppHost versus a focused service loop.

## Week 4: API Gateway and GraphQL BFF Patterns

### Repo anchors

- [../../src/HealthQCopilot.Gateway](../../src/HealthQCopilot.Gateway)
- [../../src/HealthQCopilot.BFF](../../src/HealthQCopilot.BFF)
- [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md)

### Learning goals

1. Explain why the platform uses both a gateway and a BFF.
2. Understand edge composition and aggregation.
3. Trace a frontend request across shell, gateway, and BFF.

### Live lecture plan

1. YARP reverse proxy responsibilities.
2. GraphQL BFF as an aggregation layer.
3. Edge ownership versus domain ownership.
4. Common API composition tradeoffs.

### Guided lab

1. Trace one user-facing request path.
2. Document which parts are pass-through versus aggregated.
3. Identify one future BFF extension point.

### Office hour focus

- GraphQL questions.
- API edge tradeoffs.
- Aggregation patterns.

### Homework

Sketch a request-flow diagram for one shell page or MFE route.

## Week 5: Shell Host and Remote Micro Frontends

### Repo anchors

- [../../frontend/apps/shell](../../frontend/apps/shell)
- [../../frontend/apps](../../frontend/apps)
- [../stakeholders/frontend-engineers.md](../stakeholders/frontend-engineers.md)

### Learning goals

1. Understand route composition and remote loading.
2. Explain why the platform uses MFEs in healthcare workflows.
3. Recognize contract risks between shell and remotes.

### Live lecture plan

1. Shell host responsibilities.
2. Remote MFE boundaries and ownership.
3. User workflow composition across multiple domains.
4. Deployment independence and coordination costs.

### Guided lab

1. Run the shell and inspect one remote route.
2. Change one simple UI element or configuration path.
3. Verify the update in the composed experience.

### Office hour focus

- Module Federation basics.
- Remote loading issues.
- Frontend workspace tooling.

### Homework

Document one reason the current platform benefits from MFEs and one tradeoff the team has to manage.

## Week 6: Shared Frontend Contracts and Cross-MFE Events

### Repo anchors

- [../../frontend/packages/mfe-events](../../frontend/packages/mfe-events)
- [../../frontend/packages/graphql-client](../../frontend/packages/graphql-client)
- [../../frontend/packages/web-pubsub-client](../../frontend/packages/web-pubsub-client)

### Learning goals

1. Treat shared packages as contracts, not utilities.
2. Understand typed CustomEvent usage across MFEs.
3. Recognize compatibility risks in shared client changes.

### Live lecture plan

1. Event contract design.
2. Shared GraphQL and real-time clients.
3. Backward compatibility expectations.
4. Contract testing mindset for MFEs.

### Guided lab

1. Publish and consume one typed cross-MFE event.
2. Identify cleanup and async UI behaviors.
3. Explain how a breaking change would ripple through consuming apps.

### Office hour focus

- Shared package versioning.
- Frontend contract evolution.
- Real-time UI questions.

### Homework

Propose one new typed event and describe its payload and compatibility rules.

## Week 7: AI Orchestration with Semantic Kernel

### Repo anchors

- [../../src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents)
- [../stakeholders/ai-engineers.md](../stakeholders/ai-engineers.md)

### Learning goals

1. Explain the AI service structure.
2. Understand plugin composition and service wiring.
3. Recognize orchestration versus raw prompt usage.

### Live lecture plan

1. Agents service structure.
2. Semantic Kernel plugin registration.
3. Orchestration services and workflow dispatch.
4. Why AI behavior must remain observable and deterministic enough for tests.

### Guided lab

1. Inspect one existing plugin or orchestration service.
2. Extend a plugin method or add a simple orchestration branch.
3. Document fallback behavior for low-confidence paths.

### Office hour focus

- Plugin design.
- Prompt orchestration.
- AI service boundaries.

### Homework

Write a short note on why orchestration is a stronger teaching surface than prompt tuning alone.

## Week 8: RAG, Data Services, and Clinical Integration

### Repo anchors

- [../../src/HealthQCopilot.Agents/Rag](../../src/HealthQCopilot.Agents/Rag)
- [../../src/HealthQCopilot.Fhir](../../src/HealthQCopilot.Fhir)
- [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs)

### Learning goals

1. Explain the platform data dependencies.
2. Understand Qdrant, Redis, PostgreSQL, and FHIR roles.
3. Connect retrieval and clinical integration to workflow value.

### Live lecture plan

1. Per-service data ownership.
2. Qdrant and retrieval support.
3. HAPI FHIR and clinical data integration.
4. Where healthcare-specific complexity enters the platform.

### Guided lab

1. Trace one retrieval or data access path.
2. Explain what data is owned locally versus integrated externally.
3. Demonstrate or document one RAG-related flow.

### Office hour focus

- Data ownership.
- Retrieval strategies.
- FHIR questions.

### Homework

Describe one data-governance risk and how the current service boundaries help contain it.

## Week 9: Voice, Triage, and Human-in-the-Loop Workflow

### Repo anchors

- [../../frontend/apps/voice-mfe](../../frontend/apps/voice-mfe)
- [../../frontend/apps/triage-mfe](../../frontend/apps/triage-mfe)
- [../../src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents)

### Learning goals

1. Walk the core user workflow end to end.
2. Explain escalation and review behavior.
3. Understand why uncertainty handling is a product feature.

### Live lecture plan

1. Voice capture and transcript flow.
2. Triage orchestration and event handoff.
3. Escalation to human review.
4. Async UI states and reliability expectations.

### Guided lab

1. Run or simulate a voice-to-triage workflow.
2. Observe success and low-confidence branches.
3. Document the human-in-the-loop decision path.

### Office hour focus

- Async UX questions.
- HITL design decisions.
- Cross-MFE workflow tracing.

### Homework

Explain why human review is a core product control rather than a fallback.

## Week 10: Testing Strategy and Regression Safety

### Repo anchors

- [../../tests](../../tests)
- [../stakeholders/qa-engineers.md](../stakeholders/qa-engineers.md)
- [../../.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml)

### Learning goals

1. Understand how test layers map to platform risk.
2. Explain backend unit and integration coverage.
3. Recognize cloud E2E and regression-test responsibilities.

### Live lecture plan

1. Unit, integration, local E2E, and cloud E2E responsibilities.
2. Testcontainers and service-level testing.
3. Cloud E2E as a release gate.
4. Regression tests as architecture insurance.

### Guided lab

1. Run at least one backend and one frontend test path.
2. Add or review one regression test tied to a real bug category.
3. Explain which failure mode it protects.

### Office hour focus

- Test strategy.
- Deterministic test design.
- Cloud E2E coverage questions.

### Homework

Write a short release-signoff checklist using the QA guide as the source of truth.

## Week 11: DevSecOps, Compliance, and Release Safety

### Repo anchors

- [../../infra](../../infra)
- [../../.github/workflows](../../.github/workflows)
- [../stakeholders/devops-engineers.md](../stakeholders/devops-engineers.md)
- [../stakeholders/security-compliance.md](../stakeholders/security-compliance.md)

### Learning goals

1. Explain the application delivery track and GitOps baseline.
2. Understand release-safety and rollback workflows.
3. Connect security scans and compliance artifacts to release decisions.

### Live lecture plan

1. CI/CD workflow overview.
2. Bicep, Helm, ArgoCD, and rollout assets.
3. Trivy, Gitleaks, compliance checks, and health evidence.
4. Why release safety is part of the product, not an afterthought.

### Guided lab

1. Walk through a deployment or validation workflow.
2. Review release evidence requirements.
3. Build a mock go or no-go release decision.

### Office hour focus

- Azure delivery path.
- Security scan interpretation.
- Rollback strategy.

### Homework

Prepare a one-page release-readiness summary for the capstone change.

## Week 12: Capstone Delivery and Architecture Defense

### Repo anchors

- [../../src](../../src)
- [../../frontend/apps](../../frontend/apps)
- [../diagrams/README.md](../diagrams/README.md)
- [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md)

### Learning goals

1. Integrate learning across backend, frontend, AI, and DevSecOps.
2. Present a small feature, fix, or architecture enhancement.
3. Defend design decisions using repo evidence.

### Live lecture plan

1. Capstone review expectations.
2. Architecture defense rubric.
3. Common platform tradeoffs and how to explain them.
4. Course wrap-up and production-readiness reflection.

### Guided lab

1. Finalize capstone implementation or design package.
2. Prepare a short architecture review deck or demo.
3. Present change impact, validation evidence, and next risks.

### Office hour focus

- Final coaching.
- Architecture review prep.
- Course feedback.

### Homework

Submit the final capstone summary, validation evidence, and one-page reflection on what makes this platform teachable as healthcare AI infrastructure.
