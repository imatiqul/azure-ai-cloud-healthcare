---
spec: 025-event-contracts
finding: N9
tier_declared: high
owner_role: solutions-architect
principles: [P-20]
touches: [lib-domain, revenue-service, topic-revenue.prior-auth.status-changed]
depends_on:
  nodes: [pubsub]
  specs: [004-audit-identity, 013-migrations-production-engine]
---
# Feature Specification: Every event topic is in one catalogue, and has a publisher

- **Phase and date:** Phase 5, batch 4, 2026-11-22; rewritten the same day in Phase 6, after finding N9 was corrected. Draft, waiting at gates G1 and G2
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `6e0879d2`
- **Requirement IDs exercised:** GOV-9, MAP-5, MAP-6, MAP-8, TRC-1, PRD-1 to PRD-3
- **Assumptions:** A1 to A3 under "Questions for G2". The tier follows the components
- **Unverified:** nothing was built or run. The counts are from the kit's discovery, run over a copy of the repository on 2026-11-22, and from reading the files it cites

## Finding
N9, corrected on 2026-11-22. As first written it said that two topics had subscribers and no publisher, and that 27 publish calls named their topic by something other than a literal. Both statements were wrong: the pattern used in Phase 1 did not read a call that names its arguments across lines. An automated review of pull request 72 pointed to the two publishers.

What the code shows: 35 topics. 33 are published, from 38 call sites; 36 of those write the topic's name as a literal at the call, and 2 choose between two literals at run time. One topic, `revenue.prior-auth.status-changed`, has a subscriber and no publisher. One, `healthq-dlq`, is the dead-letter topic the message broker fills. No list of topics exists: each name is written wherever it is used.
Evidence: `src/HealthQCopilot.RevenueCycle/Controllers/RevenueSubscriberController.cs:89` (the subscriber with no publisher) and `:99-103`, and `src/HealthQCopilot.Agents/Services/TriageOrchestrator.cs:299-302` (the two calls that choose at run time); the system map, where each topic and each publisher cites its file.

## User Stories
- As an architect, I want one list of the events this system sends, so that I can see who publishes and who listens before I change one.
- As a developer, I want a topic name that is not on the list to fail the build, so that a typing mistake is not a message nobody receives.

## Requirements
- **FR-001**: Every topic that the code publishes or subscribes to MUST be an entry in one event catalogue in the shared domain library.
- **FR-002**: The build MUST fail when a publish or subscribe call names a topic that is not in the catalogue.
- **FR-003**: The system map MUST list every topic in the catalogue with its publishers and its subscribers.
- **FR-004**: A topic with a subscriber and no publisher MUST gain a publisher or lose its subscriber.

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given the topics the kit's discovery finds in the code, When they are compared with the catalogue, Then each has one entry that names what it announces.
- **AC-002** (verifies FR-002): Given a change that publishes to a topic name that is not in the catalogue, When the build runs, Then it fails and names the call.
- **AC-003** (verifies FR-003): Given the code and the system map after the change, When the kit's drift check runs, Then it finds no topic, publisher or subscriber in one that is not in the other.
- **AC-004** (verifies FR-004): Given the topic `revenue.prior-auth.status-changed`, When the code and the map are read after the change, Then it has a publisher in both, or a subscriber in neither.

## Non-Functional Requirements
- **NFR-001**: The catalogue is one file, so that a reviewer sees every topic in one place.

## Risks
- A subscriber with no publisher may be dead code, or may show that a publisher was lost. Which it is has to be found before anything is removed.
- A catalogue that is not checked goes stale. FR-002 and FR-003 are what keep it true.

## Out of Scope
- Replacing the name at each of the 38 call sites with the catalogue's constant: see A1.
- Versions and consumer tests for the events, which the kit reports as gaps of their own.
- Topics that are published and that nothing in this repository subscribes to, and facts published under two names. Both are reported to the owner as observations; see A3.

## Questions for G2
- A1 (assumed): the names written at the call sites stay as they are, and the build check compares them with the catalogue. Each service replaces its literals with the catalogue's constants when a spec next changes it.
- A2 (assumed): the plan decides, with the Solutions Architect, whether `revenue.prior-auth.status-changed` gains a publisher or loses its subscriber.
- A3 (assumed): 25 topics are published and have no subscriber in this repository, and a break-glass grant is published under two names (`identity.break-glass.granted` and `breakglass.granted`). Whether anything outside this repository listens is not known. These are for the owner to judge and are not changed here.

## PHI Involved
Events can carry PHI. This spec lists topics and checks their names. It changes no event's content.

## Access Control
Not applicable: this spec changes nothing here.

## Audit Controls
Not applicable: this spec changes nothing here.

## Integrity
A topic name that is not in the catalogue fails the build, so a message cannot be sent to a topic nobody listens to because of a typing mistake.

## Authentication
Not applicable: this spec changes nothing here.

## Transmission Security
Not applicable: this spec changes nothing here.

## Minimum Necessary
Not applicable: this spec changes nothing here.
