# LinkedIn Training Course Brief

## Working Title

Build and Operate a Cloud-Native Healthcare AI Platform

## Submission Summary

This course teaches senior engineers, architects, and platform teams how to build, run, extend, and ship a production-style healthcare AI platform using a real codebase that combines .NET microservices, React micro frontends, Semantic Kernel orchestration, Dapr-based integration, and Azure-oriented delivery workflows.

It should be positioned as a platform engineering course for regulated AI systems, not as a generic AI overview.

## Core Promise

Learners will leave with a practical mental model for how modern AI applications are actually delivered in production: bounded services, typed frontend contracts, event-driven workflows, human-in-the-loop controls, test gates, and release-safety practices.

## Why This Course Fits LinkedIn Training

1. It targets experienced practitioners rather than beginners, which supports premium positioning.
2. It combines backend, frontend, AI, platform, and quality engineering in one coherent teaching surface.
3. It focuses on production readiness, which aligns better with CTO and senior-engineer demand than framework-only instruction.
4. It uses repo evidence, not hypothetical architecture diagrams, which makes the material credible and reusable.

## Target Learner Personas

| Persona | What They Want | Why This Course Resonates |
|---|---|---|
| Senior software engineer | End-to-end platform understanding | Connects service design, UI composition, AI workflows, and testing |
| Solution architect | Boundary and deployment reasoning | Demonstrates topology, contracts, and integration tradeoffs |
| AI engineer | Production AI workflow design | Shows orchestration, governance, and human escalation in context |
| Platform or DevOps engineer | Delivery and release confidence | Connects CI/CD, rollout safety, infra assets, and cloud validation |
| Engineering manager or CTO-minded lead | Team-level delivery model | Shows how multiple specializations work inside one operating model |

## Proof Points From This Repository

- 9 backend microservices plus shared domain and infrastructure layers under [../../src](../../src).
- API gateway and GraphQL BFF split between [../../src/HealthQCopilot.Gateway](../../src/HealthQCopilot.Gateway) and [../../src/HealthQCopilot.BFF](../../src/HealthQCopilot.BFF).
- Shell host plus 7 remote MFEs under [../../frontend/apps](../../frontend/apps).
- Semantic Kernel-based AI orchestration in [../../src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents).
- Local distributed runtime defined in [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs).
- 11 named GitHub workflow files under [../../.github/workflows](../../.github/workflows) covering validation, deploy, rollback, compliance, performance, and post-deploy confidence.

## Skills Learners Will Gain

1. Explain a distributed healthcare AI platform across services, frontend composition, data, and delivery.
2. Run and troubleshoot a local distributed application using Aspire, Docker Compose, and Dapr.
3. Trace domain events and understand how outbox-based reliability supports cross-service workflows.
4. Distinguish gateway concerns from BFF aggregation concerns.
5. Extend or evaluate typed contracts across micro frontends.
6. Connect AI orchestration to operational controls and human review.
7. Defend release-readiness decisions using CI/CD and validation evidence.

## Course Shape

| Item | Proposed Shape |
|---|---|
| Delivery model | 12-week virtual instructor-led course |
| Weekly rhythm | 120-minute lecture, 90-minute lab, 30-minute office hour |
| Difficulty | Intermediate to advanced |
| Lab model | Repo-based, instructor-guided, local-first with optional cloud extension |
| Final output | Capstone feature, design review, or platform defense |

## Differentiators

1. The course teaches the platform combination rather than isolated tools.
2. The repo already contains stakeholder docs, diagrams, tests, and pipeline assets that support instruction.
3. The healthcare context raises the stakes around reliability, compliance, auditability, and escalation design.
4. Learners can map lessons directly to real enterprise software roles.

## Suggested Buyer Language

Use language like this when pitching the course:

Learn how production AI platforms are really built: with bounded services, shared contracts, real-time workflows, human review controls, cloud delivery pipelines, and measurable release confidence.

Avoid framing it as only:

1. A prompt engineering class.
2. A generic healthcare overview.
3. A microservices fundamentals course.
4. A frontend tooling tutorial.

## Required Production Assets Before Submission

1. Final syllabus and course plan from [linkedin-vilt-course-plan.md](linkedin-vilt-course-plan.md).
2. Detailed first-month delivery materials from [linkedin-vilt-weeks-1-4-instructor-pack.md](linkedin-vilt-weeks-1-4-instructor-pack.md).
3. Weekly session map from [linkedin-vilt-session-plans.md](linkedin-vilt-session-plans.md).
4. Slide deck templates and speaker notes for weeks 1 to 4.
5. Sanitized learner setup guide and deterministic demo data.
6. Capstone rubric and submission template.
7. Clarified licensing and distribution posture before broad publication.

## Instructor Profile Recommendation

The ideal instructor can speak comfortably about at least three of the following in one narrative:

1. .NET distributed backend architecture.
2. React micro frontends and shared contract design.
3. AI orchestration with product governance.
4. DevSecOps, cloud delivery, and release readiness.

## Risks To Manage

1. Local environment setup may be heavy for learners without prepared prerequisites.
2. The repo license language needs clarification before public training distribution.
3. Some cloud-oriented steps should remain optional to avoid blocking learners without Azure access.
4. Demo paths should include backup recordings for any unstable voice or browser-permission workflows.

## Submission-Ready One-Sentence Pitch

Teach experienced engineers how to build and operate a production-style healthcare AI platform by working through a real codebase that combines .NET microservices, React micro frontends, Semantic Kernel, Dapr, and Azure-oriented release practices.
