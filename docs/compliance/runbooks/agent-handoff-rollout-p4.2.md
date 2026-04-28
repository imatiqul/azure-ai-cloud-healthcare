# P4.2 — Agent Handoff Canary Rollout (`HealthQ:AgentHandoff`)

**Owner:** AI Engineering + Platform / Agent SRE
**Trigger:** P4.1 evidence pack GREEN at 100% for ≥ 24 h. P3.2 load test re-run with `AgentHandoff=on` in staging GREEN < 7 days old.
**Acceptance:** Phase-4 plan item P4.2 — *"Enable HealthQ:AgentHandoff via Argo Rollouts canary (5% → 25% → 100%, 30 min soak each, no handoff-loop runaway, planning-loop iteration budget < 6 p99)."*

This runbook complements `agent-flag-rollout-p4.1.md` (PHI redaction + token accounting + consent gate) and reuses the `agent-quality-gate` AnalysisTemplate from `infra/argocd/agent-rollout-analysis.yaml`, with two **additional** handoff-specific guards layered on top.

---

## 1. Flag in scope

| Flag | Default | Target state | Touches |
|---|---|---|---|
| `HealthQ:AgentHandoff` | off | **on** | `AgentHandoffCoordinator` (W2.1), `GoalDecomposer` LLM-driven path, `AgentPlanningLoop` multi-agent dispatch (W2.6), `AgentHandoffEnvelope` propagation |

Off-state behaviour: planning loop runs single-agent (TriageOrchestrator only) — current prod default. On-state behaviour: TriageOrchestrator may delegate to `GuideAgent`, `ClinicalEvalAgent`, or `EscalationAgent` via `AgentHandoffCoordinator.HandoffAsync()` with the shared iteration budget decremented at each hop.

---

## 2. Why a separate rollout from P4.1

`AgentHandoff` changes the **shape** of the planning loop, not just the safety filters around it. A bug in handoff routing can manifest as:

- **Handoff-loop runaway** — A→B→A→B until budget exhaust. Symptom: `agent_planning_loop_iterations` p99 spikes, `agent_planning_loop_ms` p99 spikes, but `agent_guard_verdict_total{verdict="unsafe"}` may stay clean (loop doesn't generate unsafe content, just burns tokens).
- **Cost amplification** — each handoff is a fresh LLM call. Cost per session can 3–5× if routing is too eager.
- **Trace-recorder pressure** — every handoff emits a `Kind="handoff"` trace step plus a fresh `llm_call` per receiving agent. Cosmos trace partition can saturate under load.

P4.1 quality gate (hallucination + groundedness) does **not** catch the first two. P4.2 adds two iteration-budget-focused gates on top.

---

## 3. Rollout shape

Same 5% → 25% → 100% with 30-min soaks. Total wall-clock: ~1h 45m happy path.

```
T+0    pre-flight: P4.1 stable @ 100% for 24h+, AgentHandoff flag at 0%
T+0    set HealthQ:AgentHandoff:WeightPercent=5
       (rolling restart to pick up ConfigMap)
T+5    AnalysisRun #1 starts with template `agent-quality-gate` + handoff overlay
T+35   gate green → 25%
T+70   gate green → 100%
T+105  done; hold at 100% for 24 h before P4.3 (ClinicalEval) starts
```

Roll-back path: same `kubectl patch` pattern as P4.1, single key:

```bash
kubectl -n healthq-copilot patch configmap healthq-feature-flags \
  --type merge -p '{"data":{"HealthQ__AgentHandoff__WeightPercent":"0"}}'
kubectl -n healthq-copilot rollout restart deployment/healthq-agents
```

---

## 4. Quality gate — handoff-specific overlay

In addition to all five `agent-quality-gate` metrics from P4.1 (which still apply), the P4.2 AnalysisRun also enforces:

| Metric | Threshold | Source (PromQL) | Rationale |
|---|---|---|---|
| Planning-loop iteration p99 (5m) | ≤ 6 | `histogram_quantile(0.99, sum(rate(agent_planning_loop_iterations_bucket[5m])) by (le))` | Catches handoff-loop runaway. Single-agent baseline is 1–3; > 6 means routing is bouncing. |
| Cost per session p95 (5m) | ≤ baseline × 2.0 | `histogram_quantile(0.95, sum(rate(agent_session_cost_usd_bucket[5m])) by (le))` | Multi-agent legitimately costs more, but > 2× baseline indicates over-handoff. |
| Handoff depth p95 (5m) | ≤ 3 | derived from trace recorder via Kusto health probe — see § 5 | Hard cap on agents-per-session; > 3 hops should be exceptional. |

Cost ceiling note: the 2.0× multiplier here is **looser** than P4.1's 1.25× because multi-agent paths legitimately cost more. After 7 days at 100%, recalibrate the baseline using only sessions that exercised handoff and tighten to 1.5×.

The first two metrics live in the existing `agent-quality-gate` template if you extend it; the third needs a Kusto sidecar query (below) since trace-step depth isn't a Prometheus signal today. Acceptable: run the Kusto query manually at the **end** of each soak window and gate promotion on it. (Future work: emit `agent_handoff_depth` Histogram from `AgentPlanningLoop` so Argo can gate it directly.)

---

## 5. Handoff-depth Kusto health probe

Run before promoting from each soak. Replace `<windowStart>` / `<windowEnd>` with the soak window UTC bounds:

```kusto
AgentTraceSteps_CL
| where TimeGenerated between (datetime(<windowStart>) .. datetime(<windowEnd>))
| where Kind_s == "handoff"
| summarize HandoffCount = count() by SessionId_s
| summarize
    p50 = percentile(HandoffCount, 50),
    p95 = percentile(HandoffCount, 95),
    p99 = percentile(HandoffCount, 99),
    maxDepth = max(HandoffCount),
    sessionsWithHandoff = count()
```

**Pass:** `p95 ≤ 3`, `maxDepth ≤ 6`. **Fail:** any `maxDepth > 8` (likely a routing bug); abort and rollback even if Prometheus gates passed.

Pair with this query to check that the iteration budget is doing its job:

```kusto
AgentPlanningLoop_CL
| where TimeGenerated between (datetime(<windowStart>) .. datetime(<windowEnd>))
| summarize budgetExhaustionRate = countif(Outcome_s == "budget-exhausted") * 1.0 / count()
```

**Pass:** `budgetExhaustionRate < 0.05` (under 5% of sessions hit the budget). **Fail:** `> 0.10` — the iteration budget (W2.6) is being routinely exhausted, suggesting either a routing flap or budget too tight for AgentHandoff workloads.

---

## 6. Pre-flight checklist

- [ ] P4.1 rollout at 100% for ≥ 24 h, all P4.1 evidence captured.
- [ ] Staging load test (`agent-planning-loop.js`) re-run with `HealthQ:AgentHandoff=on` AND default-on for `PhiRedaction`/`TokenAccounting`/`PatientConsentGate`. Pass criteria: same as P3.2 baseline + handoff p95 ≤ 3.
- [ ] `agent-cost.json` baseline panel for the **prior 7 days** (post-P4.1) is populated — needed for the 2.0× multiplier comparison.
- [ ] `BusinessMetrics.HandoffsPerSession` / equivalent emission verified in a single staging trace (manual smoke test). If the metric is not yet emitted, capture the Kusto baseline instead and document.
- [ ] AOAI TPM headroom ≥ 3× current production peak (handoff doubles per-session token spend in worst case).
- [ ] On-call rotation acknowledged. PagerDuty silence not in effect.

---

## 7. Rollback triggers

Flat rollback (`HealthQ:AgentHandoff:WeightPercent=0`) on any of:

- AnalysisRun fails on any of the 5 P4.1 base metrics OR the 2 handoff overlays.
- Manual `kubectl argo rollouts abort`.
- Kusto handoff-depth probe fails `maxDepth ≤ 6` at any soak boundary.
- ≥ 5 PagerDuty pages from `agent-quality` or `agent-cost` Grafana alerts in soak window.
- AOAI quota throttle responses (HTTP 429) on `healthq-agents` exceed 1% over any 5-min window — handoff is amplifying token spend faster than expected.
- Any HIPAA / safety incident raised against the running config.

---

## 8. Evidence to capture

Save under `docs/compliance/evidence/p4.2-handoff-rollout/{yyyy-MM-dd}/`:

1. AnalysisRun outputs for all 3 phases.
2. Grafana snapshot of `agent-quality.json` covering the full 1h 45m window.
3. Grafana snapshot of `agent-cost.json` showing per-session p95 cost vs. the 2.0× ceiling.
4. Kusto query results from § 5 for each of the 3 soak windows.
5. ConfigMap diff (off → 100%).
6. One sample agent trace with handoff depth ≥ 2 (positive proof handoff actually fired in canary cohort) — fetch via `GET /api/v1/agents/traces/{sessionId}` against the staging admin proxy or via `AgentTraceSteps_CL` Kusto pull.

---

## 9. Cross-references

- AnalysisTemplate: `infra/argocd/agent-rollout-analysis.yaml` (extend with handoff overlay if/when iteration histogram emission lands).
- Coordinator: `src/HealthQCopilot.Agents/Services/Orchestration/AgentHandoffCoordinator.cs` (W2.1).
- Planning loop: `src/HealthQCopilot.Agents/Services/AgentPlanningLoop.cs` (W2.6 budget + W5.6 cancellation).
- Predecessor runbook: `docs/compliance/runbooks/agent-flag-rollout-p4.1.md`.
- Successor: `docs/compliance/runbooks/agent-clinical-eval-rollout-p4.3.md` (planned).
- HIPAA evidence pack: `docs/compliance/HIPAA-Agentic-AI-Evidence-Pack.md`.
