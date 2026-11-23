# Plan: authentication fails closed (001, finding C1)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, QLT-3, QLT-7 to QLT-9
- **Assumptions:** P1 to P3 under "Decisions this plan makes"
- **Unverified:** written from reading the code. Nothing was built or run

## What the code does today

`AddHealthcareAuth` decides at start-up which authentication to register (`src/HealthQCopilot.Infrastructure/Auth/JwtBearerExtensions.cs:26-39`). With no `AzureAd:ClientId` it registers a handler that authenticates every request as one user holding all four roles (lines 71-86). It does not look at the environment. The deploy workflow leaves a service in that state on purpose when its Entra variables are unset (`.github/workflows/microservice-deploy.yml:457-461`). Ten projects call `AddHealthcareAuth`: the nine services and the gateway.

## The change

All of it is in the shared infrastructure library and in one workflow file.

1. **A setting, off by default:** `Authentication:DevelopmentIdentity`. The demo handler is registered only when no identity provider is configured, and it authenticates a request only when the environment is `Development` and the setting is on. Otherwise it returns no identity, and a guarded endpoint answers 401 (AC-003).
2. **A start-up check**, registered by `AddHealthcareAuth` itself so that the gateway gets it too. It runs before the service takes traffic and stops the process, naming the setting, when:
   - no identity provider is configured and the environment is not `Development` (AC-001, AC-002);
   - the development-identity setting is on and the environment is not `Development` (AC-004).
   It makes no network call: it reads configuration and the environment name (NFR-001).
3. **One log line at start-up** names the issuer the service validates tokens against, or says that the development identity is in use. No secret is in it (AC-006).
4. **The deploy workflow fails** where it now prints "keeping demo auth mode" (AC-005).
5. **An architecture test** lists every place that builds an authenticated identity without a validated token and fails when there is one besides the development-identity handler (AC-007). Test doubles in the test projects are on its allowlist by path.

## Decisions this plan makes
- P1: the check is a hosted service that the library registers. The library already has one of the same kind (`Startup/StartupValidationService.cs`), which nine services register by hand; the gateway does not, which is why this one is registered by the library.
- P2: no hosted environment uses the name `Development`. The Helm values and the container-app scripts all set `Production` (`infra/helm/values.yaml`, `infra/aca/bootstrap.sh:137`, `infra/scripts/create-gateway-aca.sh:31`, `infra/scripts/create-revenue-aca.sh:23`). `Development` appears in the gateway's launch settings and in one workflow step that exports the API description with dummy settings (`microservice-deploy.yml:257`). That step builds the application without starting it, so the start-up check does not run there. Assumption A1 of the spec needs no rename.
- P3: the integration tests register their own scheme and remove hosted services (`tests/HealthQCopilot.Tests.Integration/ServiceWebApplicationFactory.cs:36-40`). They are unaffected; the new behaviour is tested in the unit project.

## Requirements, criteria, tasks

| Requirement | Criterion | Proven by | Task |
|---|---|---|---|
| FR-001 | AC-001, AC-002 | Unit tests of the start-up check: Production and Staging with no client id | T002, T003 |
| FR-002 | AC-003 | Unit test: Development, setting off, no token, 401 | T002, T003 |
| FR-002 | AC-004 | Unit test: Production with the setting on refuses to start | T002, T003 |
| FR-003 | AC-005 | A run of the deploy workflow with the variables unset, in a test environment | T004 |
| FR-004 | AC-006 | Unit test on the log line; a search of it for the client secret's name | T002, T003 |
| FR-005 | AC-007 | The architecture test, and the same test against a second handler added in a test fixture | T005 |

## Risks the plan carries
- **Every deployment that runs in demo mode today stops starting.** That is the point, and it is an outage for anyone relying on it. The plan's first task is to list them. The spec's A2 says a public demo needs a waiver, not a setting.
- **The check runs when hosted services start**, as the library's existing start-up validation does. The plan relies on the server not taking a request before that; the integration test in the strategy asserts it, and the task fails if it does not hold.
- **The workflow change is outside the spec's `touches`.** The spec declares the shared library only. The kit does not count workflow files against a spec, so no check fails; the pipeline is a component on the map since batch 2, and adding it to this spec's `touches` is an amendment.

## Found while planning, and not part of this change
1. The existing start-up validation treats a missing database connection string as an error only if all twelve names it knows are missing (`StartupValidationService.cs:22-34, 80-87`). A service started with another service's connection string passes.
2. With no connection string a service does not fail: it falls back to a local SQLite file (`Persistence/DatabaseExtensions.cs:54-57`). That is finding H5's territory (spec 013).

## For the reviewer at G3
- Should the check also refuse a `Development` environment that has an identity provider configured and the setting on? The plan says no: the setting is ignored when a provider is configured.
- Who lists the deployments that run in demo mode today? The repository cannot say.
