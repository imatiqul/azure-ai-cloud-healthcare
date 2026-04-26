# Operational Hardening Runbook

This runbook standardizes rollback drills and incident response for the highest-risk production paths.

## Scope

- Deployment identity and workflow authentication failures.
- Container registry authentication and image pull failures.
- Gateway route regressions (`404`, `405`, `502`, `503`).
- Post-rollback acceptance gating and evidence capture.

## Top-Risk Services and Drill Priority

| Service | Why It Is High Risk | Minimum Drill Cadence |
|---|---|---|
| gateway | Single API edge for all backend service traffic | Weekly |
| identity | Auth, consent, break-glass, admin audit paths | Weekly |
| ai-agent | AI orchestration and triage workflow continuity | Bi-weekly |
| scheduling | Appointment and operational continuity | Bi-weekly |
| notification | Patient/staff communication continuity | Monthly |
| revenue | Claims/coding and financial workflow continuity | Monthly |

## Standard Rollback Drill Procedure (Dev First)

1. Select service and known-good target SHA.
2. Trigger [rollback workflow](../../.github/workflows/rollback.yml) in `dev` with reason `rollback-drill-<ticket>`.
3. Confirm all rollback workflow jobs pass:
   - `preflight`
   - `rollback`
   - `post-rollback-verification`
   - `rollback-summary`
4. Verify post-rollback acceptance gates:
   - Gateway `/health` returns `200`.
   - Live seed checks pass via [prepare-live-seed-data.sh](../../.github/scripts/prepare-live-seed-data.sh).
   - Route smoke probes pass via [post-rollback-route-probes.sh](../../.github/scripts/post-rollback-route-probes.sh).
5. Record drill evidence in [rollback-drill-log.md](rollback-drill-log.md).

## Post-Rollback Acceptance Gates

These are required pass conditions before declaring rollback complete:

- Health gate: gateway `/health` returns `200`.
- Live data gate: seed/assertion workflow in [prepare-live-seed-data.sh](../../.github/scripts/prepare-live-seed-data.sh).
- Route integrity gate: route probes must not return `404`, `405`, `502`, `503`, `504`, or network failure (`000`) for mapped gateway prefixes.

## Incident Playbooks

### 1) OIDC Federation or Azure Auth Failure

Typical indicators:
- `azure/login` fails in deploy workflows.
- Errors indicating subject/audience mismatch or token exchange failure.

Immediate checks:
1. Confirm workflow is targeting expected environment (`dev` or `prod`).
2. Confirm subject claim format for GitHub OIDC trust matches branch/environment policy.
3. Confirm `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets are present and current.

Recovery actions:
1. Correct federated credential subject/audience in Entra workload identity.
2. Re-run failed workflow on same SHA.
3. If release is blocked, execute rollback for impacted services and re-open deploy window after auth fix.

Exit criteria:
- `azure/login` succeeds on rerun.
- Smoke validation returns green for target SHA.

### 2) Registry Authentication or Image Pull Failure

Typical indicators:
- `ImagePullBackOff`, unauthorized image pull, or manifest missing errors.
- Deploy succeeded partially but new revision fails to start.

Immediate checks:
1. Validate target image exists for requested SHA/tag in registry.
2. Verify runtime identity has pull rights.
3. Verify workflow auth token scope and registry credentials.

Recovery actions:
1. Restore pull permission or credentials.
2. Redeploy with confirmed image tag.
3. Roll back to last known-good revision if startup health degrades.

Exit criteria:
- New or restored revision is active and healthy.
- Post-rollback/post-deploy probes succeed.

### 3) Gateway Route Regression (`404`/`405`/`502`/`503`)

Typical indicators:
- API edge route probes fail immediately after deploy.
- Service health may be green while edge routing is broken.

Immediate checks:
1. Validate route ownership mapping in [api-route-ownership-map.md](api-route-ownership-map.md).
2. Confirm route still exists in [gateway appsettings](../../src/HealthQCopilot.Gateway/appsettings.json).
3. Confirm destination cluster resolves correctly in production settings.

Recovery actions:
1. Restore previous route configuration or service endpoint compatibility.
2. Run rollback workflow for impacted service(s) or gateway.
3. Re-run route probe gate and cloud smoke validation.

Exit criteria:
- No critical route returns `404`/`405`/`502`/`503`.
- Rollback/deploy evidence attached to incident record.

## Evidence and MTTR Tracking

Each incident or drill record should include:

- Trigger timestamp (UTC)
- Detection source (workflow/runbook/on-call)
- Service(s) impacted
- Start of mitigation timestamp
- Recovery complete timestamp
- Total restoration time in minutes
- Workflow run links and artifact references
- Root cause category
- Preventive action owner and due date

MTTR calculation:
- `MTTR = recovery_complete_utc - detection_utc`

Target:
- Rolling MTTR under 4 hours for release-gate restoration.
