# P4.1 — Agent Safety Flag Canary Rollout

**Owner:** Platform / Agent SRE + AI Engineering
**Trigger:** P3.x evidence pack GREEN, P3.2 load test GREEN < 7 days old, eval-CI green on `main` for ≥ 24 h.
**Acceptance:** Phase-4 plan item P4.1 — *"Enable HealthQ:PhiRedaction + HealthQ:TokenAccounting flags via Argo Rollouts canary (5% → 25% → 100%, 30 min soak each, hallucination rate < 2% gate)."*

This runbook governs the **flag rollout**, not the image rollout. Image-level rollouts use the existing `infra/argocd/rollouts.yaml` 20/40/60/100 strategy with the generic HTTP `healthq-success-rate` AnalysisTemplate. The agent-safety flags require a dedicated quality-gate template that pivots on hallucination + groundedness — defined in the companion file `infra/argocd/agent-rollout-analysis.yaml`.

---

## 1. Flags in scope

| Flag | Default | Target state | Touches |
|---|---|---|---|
| `HealthQ:PhiRedaction` | off | **on** | RedactingChatCompletionDecorator + RedactingLlmGateway (W1.1/W1.2) |
| `HealthQ:TokenAccounting` | off | **on** | CosmosTokenLedger persistence (W4.1); OTel emission already always-on |
| `HealthQ:PatientConsentGate` | off | **on** | TriageOrchestrator pre-LLM consent check (W1.6) |

Out of scope here (P4.2/P4.3 cover separately): `HealthQ:AgentHandoff`, `HealthQ:CriticReview`, `HealthQ:ToolRbac`, `HealthQ:ClinicalEval`.

---

## 2. Rollout shape

Three soak windows, **5% → 25% → 100%**, each preceded by an automated quality gate (Argo `AnalysisRun` against the `agent-quality-gate` template) and held for **30 minutes** of clean signal before promotion.

```
T+0    pre-flight: image stable @ 100%, flags off, dashboards green for 24h
T+0    set HealthQ:PhiRedaction:WeightPercent=5,
           HealthQ:TokenAccounting:WeightPercent=5,
           HealthQ:PatientConsentGate:WeightPercent=5
       (rolling restart of agents deployment to pick up ConfigMap)
T+5    AnalysisRun #1 starts; soak 30m
T+35   gate green → bump to 25%
T+40   AnalysisRun #2 starts; soak 30m
T+70   gate green → bump to 100%
T+75   AnalysisRun #3 starts; soak 30m
T+105  gate green → done; hold at 100% for 24h before P4.2
```

Total wall-clock: ~1h 45m happy path. Roll-back path (any gate fail): set all three flags to `WeightPercent=0` immediately, leave image stable, file an incident, do **not** retry until the failing metric has been root-caused.

---

## 3. Quality gate — pass criteria (per AnalysisRun)

The AnalysisTemplate `agent-quality-gate` (companion file) evaluates these every 60 s, 30 times over 30 min, with `failureLimit: 3` (i.e., > 3 failed evaluations in any 30-min window aborts):

| Metric | Threshold | Source (PromQL) |
|---|---|---|
| Hallucination rate (5m) | **< 2%** | `sum(rate(agent_guard_verdict_total{verdict="unsafe"}[5m])) / sum(rate(agent_guard_verdict_total[5m]))` |
| Mean groundedness (5m) | ≥ 0.85 | `avg(agent_groundedness_score{quantile="0.5"})` (Histogram avg, 5m window) |
| Planning-loop p99 (5m) | ≤ 5000 ms | `histogram_quantile(0.99, sum(rate(agent_planning_loop_ms_bucket[5m])) by (le))` |
| Cost / 1k requests (5m) | ≤ baseline × 1.25 | `sum(rate(agent_llm_cost_usd_total[5m])) / sum(rate(http_server_requests_seconds_count{service="healthq-agents",status=~"2.."}[5m])) * 1000` |
| 5xx error rate (5m) | < 1% | standard HTTP success-rate query |

Cost ceiling note: the 1.25× multiplier reflects expected overhead from W4.6 model-version stamping + W4.2 cost attribution emission (both add ~5–10% per-call) plus headroom. After 7 days at 100%, recalibrate the baseline and tighten to 1.10×.

---

## 4. Pre-flight checklist

- [ ] Image rollout (existing `healthq-agents` Rollout) at `phase=Healthy`, status `Promoted` for ≥ 24 h.
- [ ] `agent-quality.json` Grafana dashboard shows hallucination < 1% and groundedness ≥ 0.90 over the last 24 h with the flags **off** (proves the floor).
- [ ] `agent-cost.json` dashboard has a populated baseline panel for the prior 24 h (W4.2 cost-attribution emission was confirmed shipping in turn `ad`).
- [ ] PHI egress verification (P3.3 runbook `phi-egress-verification.md`) executed and PASS within last 7 days.
- [ ] Load test (P3.2 runbook `agent-planning-loop-load-test.md`) executed against staging within last 7 days; p99 < 5 s confirmed; ≥ 1% budget-trip rate confirmed.
- [ ] On-call rotation for both Platform and AI Engineering has acknowledged the rollout window.
- [ ] PagerDuty silence policy NOT in effect; alert routing verified end-to-end via test alert.

---

## 5. Rollback

Any of the following fires → flat rollback (all three flags to `WeightPercent=0`):

- AnalysisRun fails (failureLimit: 3 hit on any metric)
- Manual operator intervention via `kubectl argo rollouts abort`
- ≥ 5 PagerDuty pages from `agent-quality` Grafana alerts within the soak window
- Any HIPAA / safety incident raised against the running config (any severity)

Rollback procedure:
```bash
kubectl -n healthq-copilot patch configmap healthq-feature-flags --type merge -p '{"data":{"HealthQ__PhiRedaction__WeightPercent":"0","HealthQ__TokenAccounting__WeightPercent":"0","HealthQ__PatientConsentGate__WeightPercent":"0"}}'
kubectl -n healthq-copilot rollout restart deployment/healthq-agents
```

The flag system uses `Microsoft.FeatureManagement` percentage-based filter — rollback takes ≤ 60 s once the new ConfigMap is applied and pods recycle.

---

## 6. Evidence to capture

Save under `docs/compliance/evidence/p4.1-flag-rollout/{yyyy-MM-dd}/`:

1. AnalysisRun outputs for all 3 phases (`kubectl get analysisrun -n healthq-copilot -o yaml`).
2. Grafana snapshot of `agent-quality.json` covering the full 1h 45m window.
3. Grafana snapshot of `agent-cost.json` covering the same window with the 1.25× ceiling annotation.
4. Kusto query result: `AuditEvent` table filtered to `eventType in ("phi_redacted","agent_decision","workflow_dispatched")` for the test window — proves chain-of-custody continued emitting through the cutover.
5. Final ConfigMap diff (off → 100%).

---

## 7. Cross-references

- AnalysisTemplate: `infra/argocd/agent-rollout-analysis.yaml` (companion file, this turn).
- Image-level Rollout: `infra/argocd/rollouts.yaml` `healthq-agents`.
- Dashboard: `infra/k8s/monitoring/dashboards/agent-quality.json` (W3.6) + `agent-cost.json` (W4.2).
- Recording rules: `infra/k8s/monitoring/recording-rules.yaml`.
- HIPAA evidence pack: `docs/compliance/HIPAA-Agentic-AI-Evidence-Pack.md`.
