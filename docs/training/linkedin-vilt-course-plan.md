# LinkedIn VILT Course Plan

## Course Title

Build and Operate a Cloud-Native Healthcare AI Platform

## Course Promise

Teach experienced engineers how to reason about, run, extend, and defend a production-style AI platform where backend services, frontend contracts, orchestration logic, and delivery controls all matter at the same time.

## Course Positioning

This course teaches learners how to design, run, extend, test, and ship a production-style healthcare AI platform using the actual Azure AI Cloud Healthcare codebase.

The course is differentiated because it combines:

1. .NET microservices and DDD boundaries.
2. React micro frontends with shared contracts.
3. AI orchestration with Semantic Kernel.
4. Event-driven integration with Dapr.
5. Cloud delivery, release safety, and compliance-oriented DevSecOps.

This should be marketed as a platform engineering course for healthcare AI, not as a generic AI, microservices, or frontend course.

## Why This Course Is Marketable

1. It connects AI to delivery reality instead of treating AI as a standalone prompt exercise.
2. It gives senior learners a credible end-to-end system to reason about across architecture, implementation, and release safety.
3. It supports both enterprise cohort delivery and creator-led training because the labs are local-first and repo-backed.
4. It maps naturally to role progression for senior engineers, architects, and platform-minded technical leads.

## Target Audience

- Senior software engineers.
- Solution architects.
- AI engineers and platform engineers.
- DevOps and SRE practitioners.
- Technical leads building regulated or workflow-heavy applications.

## Format

| Item | Recommendation |
|---|---|
| Duration | 12 weeks over 3 months |
| Live lecture | 120 minutes per week |
| Guided lab | 90 minutes per week |
| Office hour | 30 minutes per week |
| Delivery mode | Virtual instructor-led with repo-based labs |
| Assessment | Weekly check-ins + final capstone |

## Learner Outcomes

By the end of the course, learners should be able to:

1. Explain the end-to-end architecture of the platform across frontend, backend, AI, data, and Azure delivery.
2. Run the distributed application locally using Aspire, Docker Compose, and Dapr.
3. Trace domain workflows across gateway, BFF, microservices, and micro frontends.
4. Extend a service or frontend capability without breaking contracts.
5. Add or modify AI orchestration using Semantic Kernel plugins and confidence routing.
6. Validate changes using unit, integration, E2E, and cloud E2E strategies.
7. Explain the DevSecOps pipeline, release safety controls, and rollback path.
8. Defend architectural tradeoffs in a capstone review.

## Teaching Surfaces In This Repository

| Teaching Surface | Primary Anchors |
|---|---|
| Platform orientation | [../../README.md](../../README.md), [../../src/HealthQCopilot.AppHost/Program.cs](../../src/HealthQCopilot.AppHost/Program.cs) |
| Backend services and DDD | [../../src/HealthQCopilot.Domain](../../src/HealthQCopilot.Domain), [../../src](../../src), [../stakeholders/backend-engineers.md](../stakeholders/backend-engineers.md) |
| Frontend federation | [../../frontend/apps](../../frontend/apps), [../../frontend/packages](../../frontend/packages), [../stakeholders/frontend-engineers.md](../stakeholders/frontend-engineers.md) |
| AI orchestration | [../../src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents), [../stakeholders/ai-engineers.md](../stakeholders/ai-engineers.md) |
| Testing strategy | [../../tests](../../tests), [../stakeholders/qa-engineers.md](../stakeholders/qa-engineers.md) |
| DevSecOps and compliance | [../../infra](../../infra), [../../.github/workflows](../../.github/workflows), [../stakeholders/devops-engineers.md](../stakeholders/devops-engineers.md), [../stakeholders/security-compliance.md](../stakeholders/security-compliance.md) |
| Architecture review | [../stakeholders/solutions-architects.md](../stakeholders/solutions-architects.md), [../diagrams/README.md](../diagrams/README.md) |

## 12-Week Curriculum Summary

| Week | Theme | Primary Repo Anchors | Learner Deliverable |
|---|---|---|---|
| 1 | Platform orientation and setup | [../../README.md](../../README.md), [../../src/HealthQCopilot.AppHost](../../src/HealthQCopilot.AppHost) | Running platform + topology diagram |
| 2 | DDD and service boundaries | [../../src/HealthQCopilot.Domain](../../src/HealthQCopilot.Domain), [../../src/HealthQCopilot.Infrastructure](../../src/HealthQCopilot.Infrastructure) | Domain-event walkthrough |
| 3 | Local distributed runtime | [../../src/HealthQCopilot.AppHost](../../src/HealthQCopilot.AppHost), [../../infra/dapr](../../infra/dapr), [../../docker-compose.yml](../../docker-compose.yml) | Service-focused local runbook |
| 4 | Gateway and GraphQL BFF | [../../src/HealthQCopilot.Gateway](../../src/HealthQCopilot.Gateway), [../../src/HealthQCopilot.BFF](../../src/HealthQCopilot.BFF) | Aggregated request flow map |
| 5 | Shell and remote MFE composition | [../../frontend/apps/shell](../../frontend/apps/shell), [../../frontend/apps](../../frontend/apps) | Shell-to-remote integration change |
| 6 | Shared frontend contracts | [../../frontend/packages](../../frontend/packages) | Typed cross-MFE event change |
| 7 | AI orchestration with Semantic Kernel | [../../src/HealthQCopilot.Agents](../../src/HealthQCopilot.Agents) | Plugin or orchestration extension |
| 8 | Data, RAG, and FHIR integration | [../../src/HealthQCopilot.Agents/Rag](../../src/HealthQCopilot.Agents/Rag), [../../src/HealthQCopilot.Fhir](../../src/HealthQCopilot.Fhir) | Retrieval or integration demo |
| 9 | Human-in-the-loop workflow design | [../../frontend/apps/triage-mfe](../../frontend/apps/triage-mfe), [../../frontend/apps/voice-mfe](../../frontend/apps/voice-mfe) | Voice-to-triage walkthrough |
| 10 | Platform testing and quality gates | [../../tests](../../tests), [../../.github/workflows/cloud-e2e-tests.yml](../../.github/workflows/cloud-e2e-tests.yml) | Regression test addition |
| 11 | DevSecOps, infra, and release safety | [../../infra](../../infra), [../../.github/workflows](../../.github/workflows) | Release-readiness review |
| 12 | Capstone and architecture defense | [../diagrams/README.md](../diagrams/README.md), [../../src](../../src), [../../frontend/apps](../../frontend/apps) | Final feature or platform defense |

## Weekly Asset Pack

Every week should ship the same training assets:

1. Instructor slide deck.
2. Guided lab handout.
3. Learner workbook pages.
4. Repo anchor list with pre-read links.
5. Quiz or checkpoint questions.
6. Solution notes or branch references.
7. Demo script and fallback recording notes.

For the first month, those assets should be seeded from [Weeks 1 to 4 Instructor Pack](linkedin-vilt-weeks-1-4-instructor-pack.md).

## Assessment Model

| Assessment | When | What It Measures |
|---|---|---|
| Setup checkpoint | Week 1 | Environment readiness and repo comprehension |
| Contract-change checkpoint | Week 6 | Safe frontend/backend evolution |
| AI workflow checkpoint | Week 8 | Orchestration and governance understanding |
| Release-readiness checkpoint | Week 11 | DevSecOps and compliance reasoning |
| Capstone review | Week 12 | Full-stack integration and architecture defense |

## 90-Day Production Roadmap

### Month 1: Extract and stabilize curriculum

1. Freeze a teaching baseline branch.
2. Create learner onboarding and pre-flight setup steps from [../../README.md](../../README.md).
3. Draft weeks 1 through 4 slides, labs, and instructor notes.
4. Select core diagrams from [../diagrams/README.md](../diagrams/README.md).
5. Prepare deterministic demo data and lab instructions.

### Month 2: Build labs and assessments

1. Draft weeks 5 through 8 lab guides and solution notes.
2. Draft weeks 9 through 12 labs, capstone rubric, and grading notes.
3. Create weekly quizzes and workbook checkpoints.
4. Record backup demo videos for unstable or time-sensitive steps.
5. Create capstone options for frontend, backend, AI, and platform learners.

### Month 3: Pilot and productize

1. Run a pilot cohort and capture friction points.
2. Tighten timing and simplify weak lab instructions.
3. Finalize slide decks, workbook, and instructor scripts.
4. Package the course for LinkedIn delivery with syllabus, outcomes, and promo copy.
5. Prepare a post-course repository navigation guide for learners.

## Risks and Decisions To Resolve Before Launch

1. Clarify the repository license and open-source posture before publishing the course broadly.
2. Produce sanitized, repeatable seed data for all learner labs.
3. Harden cross-platform environment setup for Windows, macOS, and Linux.
4. Decide which cloud steps are optional versus required for learners without Azure access.
5. Pre-scaffold capstone choices so week 12 focuses on integration, not repo discovery.

## Recommended Course Marketing Angle

Use this positioning:

Build and ship a production-style healthcare AI platform with .NET microservices, React micro frontends, Semantic Kernel, Dapr, Azure delivery pipelines, and real release-safety practices.

This is stronger than positioning it as only:

1. A healthcare AI course.
2. A microservices course.
3. A frontend course.
4. A Semantic Kernel course.

The differentiator is the platform combination.

## Packaging Notes

For external packaging, keep the narrative anchored in business value, platform credibility, and production readiness. The strongest framing is that learners are not just building healthcare AI features, they are learning how to ship and operate a complete healthcare AI platform.
