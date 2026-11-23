# Plan: identity comes from the validated token (003, finding C3)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, QLT-3, QLT-6 to QLT-9, CHG-19
- **Assumptions:** P1 to P3 under "Decisions this plan makes"
- **Unverified:** written from reading the code. Nothing was built or run

## What the code does today

- `TenantContextMiddleware` prefers the `X-Tenant-Id` header to the token's tenant claim, and takes the user for the log context from the token or, failing that, from an `X-User-Id` header (`src/HealthQCopilot.Infrastructure/Middleware/TenantContextMiddleware.cs:27-36`). It runs before authentication in every service that uses it, so the token's claims are never there and the header always wins.
- The rate limiter resolves the tenant, and from it the allowance, from the same header first and the token second (`Middleware/RateLimitingExtensions.cs:47-55`).
- Break-glass takes `RequestedByUserId` from the request body, and its route group names no policy (`src/HealthQCopilot.Identity/Endpoints/BreakGlassEndpoints.cs:27-54`).
- Three more reads of the header are in the agent service: `Services/GuideOrchestrator.cs:117` and `Services/TriageOrchestrator.cs:162, 376`.

## The change

1. **One place that says who the caller is.** A request-scoped `ICallerContext` in the shared library, filled after authentication from the validated token: tenant from the tenant claim, user from the subject. Nothing fills it from a header.
2. **The tenant-context middleware moves after authentication** in every service and uses the caller context. When an `X-Tenant-Id` header is present and differs from the token's tenant, it answers 403 and nothing runs (AC-002). An equal header is accepted, so existing clients that send the right tenant keep working.
3. **The rate limiter** resolves the tenant from the caller context.
4. **Break-glass** records the token's user as the requester and ignores the field in the body; the route group requires a named policy (AC-003, AC-004). The event keeps its shape (NFR-001).
5. **An architecture test** fails when code outside the tenant guard reads `X-Tenant-Id` or `X-User-Id`, or takes the acting user or tenant from a request body (AC-006).

## Decisions this plan makes
- P1: "tenant claim" is `tid`, or the claim ASP.NET Core maps it to. The middleware already knows both names (line 28-29).
- P2: the comparison in the tenant guard is the one permitted read of the header. See the first item under "For the reviewer".
- P3: the three reads in the agent service are changed to the caller context. See the second item under "For the reviewer".

## Requirements, criteria, tasks

| Requirement | Criterion | Proven by | Task |
|---|---|---|---|
| FR-001 | AC-001 | Unit test of the middleware: token for tenant A, no header | T002, T003 |
| FR-002 | AC-002 | Unit and pipeline tests: token for A, header naming B, 403, the next middleware not called | T002, T003 |
| FR-003 | AC-003 | Integration test of the break-glass endpoint: token for U, body naming V, the grant and the event name U | T004, T005 |
| FR-004 | AC-004 | Integration test: a valid token without the role, 403 | T004, T005 |
| FR-005 | AC-005 | Unit test: token for U, `X-User-Id` naming V, the log scope names U | T002, T003 |
| FR-006 | AC-006 | The architecture test, and the same test against a fixture that reads the header | T006 |

## Risks the plan carries
- **Clients that send a wrong or stale tenant header start getting 403.** The spec's A1 chose this. A search of this repository finds no code that sends either header; the comments say the API gateway sets `X-Tenant-Id`. The plan's first task finds every sender outside the repository: the gateway's policies and any other client.
- **The middleware's own comment says it must run before authentication**, so that failed sign-ins are logged with a tenant. After the move, a failed sign-in is logged with no tenant, which is the truth: an unauthenticated request has none.
- **The order of middleware now matters to three specs** (003, 004, and whatever fixes the consent middleware). The order after this spec and 004 is: security headers, authentication, tenant guard, audit, then whatever the service had, then authorization. The order test that 004 adds is extended here.

## Found while planning, and not part of this change
1. `TriageOrchestrator.cs:162` uses the header's tenant to attribute model usage and cost, defaulting to "default". Cost reports by tenant are therefore caller-asserted today.

## For the reviewer at G3
- **FR-006 and FR-002 contradict each other as written.** FR-006 fails the build when code reads a tenant from a header; FR-002 needs the header read to compare it. An automated review of pull request 72 pointed this out, and it is right. The plan follows the narrow reading: one comparison-only read, in the tenant guard, on an allowlist the architecture test prints. Proposed wording for the spec, which is an amendment and needs G1 and G2 again: "The build MUST fail when code takes the acting tenant, user or role from a request header or body", with the criterion's example unchanged.
- **The spec's `touches` is incomplete.** It names the shared library and the identity service. Three of the header reads are in the agent service, and the kit's check would refuse a change to those files under this spec. Adding `agent-service` is an amendment.
