# Agent Planning Loop — 50 RPS Load Test (P3.2)

**Owner:** Platform / Agent SRE
**Cadence:** before every canary cutover (P4.1) + ad-hoc on prompt-version bumps
**Acceptance:** Phase-3 plan item P3.2 — *"Load test planning loop at 50 RPS sustained; verify p99 < 5 s and budget enforcement triggers."*

---

## 1. Pre-conditions

| Item | Required state |
|---|---|
| Target environment | **staging** (real Azure OpenAI, real Cosmos, real Qdrant). Never run against prod. |
| AOAI deployment | `AzureOpenAI:DeploymentName` resolves to the same SKU prod will use (default `gpt-4o-mini`). |
| Feature flags | `HealthQ:PhiRedaction=on`, `HealthQ:TokenAccounting=on`, `HealthQ:AgentHandoff=on`, `HealthQ:ToolRbac=off`, `HealthQ:CriticReview=on`, `HealthQ:PatientConsentGate=on`. |
| Budget config | `AgentBudget:MaxIterations=8`, `AgentBudget:MaxTokens=16000`, `AgentBudget:MaxWallClockSeconds=30` (defaults). |
| AOAI quota | confirm ≥ 60k TPM headroom on the deployment for the 5-min window (50 RPS × ~800 tokens ≈ 40k TPM peak). |
| k6 | v0.50+ on the runner host. |

---

## 2. Synthetic data

The script (`tests/load/agent-planning-loop.js`) ships ten synthetic transcripts:
six normal-acuity, three deliberately ambiguous (force multi-iteration reflection), one long polypharmacy case (stretches token budget). All `patientId` values are `SYN-LOAD-{8 hex}` so the W1.6 consent gate auto-grants (per `DefaultConsentService` `SYN-*` exemption). **No PHI** is present in the test fixture.

---

## 3. Execution

```bash
# From repo root, against staging:
k6 run \
  --env AGENT_URL=https://staging-agents.healthq.local \
  --summary-export=tests/load/results/agent-planning-loop-k6-summary.json \
  tests/load/agent-planning-loop.js
```

Profile: 50 RPS constant-arrival-rate for 5 minutes (300 pre-allocated VUs, max 500). Total ~15,000 requests.

---

## 4. Pass / fail criteria

| Metric | Threshold | Source |
|---|---|---|
| `http_req_duration` p95 | < 3000 ms | k6 summary |
| `http_req_duration` p99 | **< 5000 ms** | k6 summary (Phase-3 SLO) |
| Error rate (5xx only) | < 1% | k6 `triage_error_rate` |
| Budget-exhausted sessions | **≥ 1%** of completed sessions | k6 `budget_exhausted_count` |
| `agent_planning_loop_ms` p99 (Grafana) | < 5000 ms | `agent-quality.json` panel |
| `outcome="budget_*"` ratio (Grafana) | non-zero in window | `agent-quality.json` outcome panel |

The budget-exhausted lower bound is intentional — it proves the W2.6 enforcement path is exercised under realistic load. A run with **zero** budget trips means the inputs are too easy and the test is not actually validating the partial-result contract; rotate in more ambiguous cases.

---

## 5. Evidence to capture

Save the following to `docs/compliance/evidence/p3.2-load-test/{yyyy-MM-dd}/`:

1. `k6-stdout.txt` — full k6 console output including the `=== P3.2 Agent Planning Loop Load Test ===` block.
2. `agent-planning-loop-summary.json` — auto-emitted by the script's `handleSummary`.
3. Grafana snapshot of `agent-quality.json` for the test window (PNG + JSON model).
4. Application Insights / Kusto queries below, with results.
5. Argo Rollouts canary analysis output if the run is gating a cutover.

### Kusto: planning-loop p99 by outcome

```kusto
customMetrics
| where timestamp between (datetime({start}) .. datetime({end}))
| where name == "agent_planning_loop_ms"
| extend agent = tostring(customDimensions["agent"]),
         outcome = tostring(customDimensions["outcome"])
| summarize p99 = percentile(value, 99), count = count() by outcome
| order by count desc
```

Expect rows for `goal_met` (largest), `budget_max_iterations` / `budget_max_tokens` / `budget_max_wall_clock` (small but non-zero), and ideally **no** `error` rows. Any `error` row > 0 is an investigation trigger — cross-reference with App Insights `exceptions` stream by `operation_Id`.

### Kusto: cost attribution sanity

```kusto
customMetrics
| where timestamp between (datetime({start}) .. datetime({end}))
| where name == "agent_llm_cost_usd_total"
| summarize totalUsd = sum(value) by tostring(customDimensions["model"])
```

Should match the AOAI billing line for the test window within ±10% (W4.2 cost attribution sanity check).

---

## 6. Known limitations

- Synthetic transcripts deliberately skew toward ambiguous to exercise the budget path; p95/p99 will sit higher than a production traffic mix where most cases are routine refills. Use this run as an **upper bound** on latency under stress, not as a baseline projection.
- The constant-arrival-rate executor will saturate VUs and start reporting `dropped_iterations` if the system can't keep up. A non-zero `dropped_iterations` count means latency has degraded enough that 50 RPS is unsustainable — treat as a hard fail even if percentiles look good.
- AOAI rate-limit (HTTP 429) responses count as errors in this script. If the deployment is undersized, the run will fail on error-rate before the latency SLO trips. Pre-flight the TPM quota.

---

## 7. Cadence & gating

- Block P4.1 canary cutover unless the most recent run on `main` is GREEN and < 7 days old.
- Re-run after any prompt-version bump (W4.5/W4.5b) — registry changes can shift token consumption ±20%.
- Re-run after any AOAI deployment SKU change.
