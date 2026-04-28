# P4.3 — ClinicalEval Continuous & CriticReview Canary Rollout

**Owner:** AI Engineering + Clinical Informatics
**Trigger:** P4.2 evidence pack GREEN at 100% for ≥ 24 h.
**Acceptance:** Phase-4 plan item P4.3 — *"Enable HealthQ:ClinicalEval (scheduled golden-set harness in production) and HealthQ:CriticReview (inline W2.3 cross-agent critic on each triage) via Argo Rollouts canary (5% → 25% → 100%, 30 min soak each)."*

These two flags are rolled together because they share the same underlying `ClinicalEvaluator` / `CriticAgent` infrastructure, both depend on `HealthQ:AgentHandoff` being stable (P4.2), and their combined latency + cost impact must be measured together.

---

## 1. Flags in scope

| Flag | Default | Target state | Touches |
|---|---|---|---|
| `HealthQ:ClinicalEval` | off | **on** | `ClinicalEvaluator.EvaluateAsync(suite, ct)` scheduled by the background `ModelGovernanceEndpoints /api/v1/governance/evaluate` — gates continuous golden-set groundedness sampling in prod; off → the harness still runs in CI via `agent-eval.yml` but not against live traffic. |
| `HealthQ:CriticReview` | off | **on** | `TriageOrchestrator` W2.3 path: after `AIGuard.VerifyAsync` passes, `ICriticAgent.ReviewAsync` cross-checks the LLM reasoning against the retrieved RAG context. On → adds ~1 extra LLM call per triage with RAG context; off → `CriticAgent` returns `NotApplicable` (no-op). |

Out of scope here: `HealthQ:ToolRbac` (deferred, post-P4.3 governance review).

---

## 2. Why ClinicalEval and CriticReview together

`HealthQ:ClinicalEval` runs the golden-set harness **outside** the live triage path — it consumes AOAI capacity independently of live traffic. `HealthQ:CriticReview` adds latency and cost **inside** the live triage path. Rolling them together means:

- The scheduled eval harness generates a live groundedness signal that validates the critic's own judgements during the soak, closing a feedback loop.
- A single evidence artefact captures both "the critic fires and passes" (from live traffic, CriticReview) and "the golden set accuracy is maintained" (from the harness, ClinicalEval) in the same 1h 45m window.
- AOAI capacity headroom must absorb both. Sizing check is mandatory in pre-flight (§ 6).

If the eval harness is too expensive to run simultaneously, defer `ClinicalEval` to a follow-up ConfigMap bump after `CriticReview` stabilises at 100%. Document the split in the evidence pack.

---

## 3. Rollout shape

```
T+0    pre-flight: P4.2 stable @ 100% for 24h+, both flags at 0%
T+0    set HealthQ:ClinicalEval:WeightPercent=5,
           HealthQ:CriticReview:WeightPercent=5
       (rolling restart)
T+5    AnalysisRun #1 (base quality gate + critic-specific overlay)
T+35   gate green → 25%
T+70   gate green → 100%
T+105  done; hold 24 h, then P4.4 (cost alerts) should already be active at 100%
```

Total wall-clock: ~1h 45m happy path.

Roll-back:

```bash
kubectl -n healthq-copilot patch configmap healthq-feature-flags \
  --type merge \
  -p '{"data":{"HealthQ__ClinicalEval__WeightPercent":"0","HealthQ__CriticReview__WeightPercent":"0"}}'
kubectl -n healthq-copilot rollout restart deployment/healthq-agents
```

---

## 4. Quality gate — critic/eval overlay

In addition to all five `agent-quality-gate` metrics from P4.1 (which apply throughout):

| Metric | Threshold | Source | Rationale |
|---|---|---|---|
| Critic rejection rate (5m) | < 15% | `sum(rate(agent_critic_rejected_total[5m])) / sum(rate(agent_critic_reviewed_total[5m]))` | > 15% means the critic is disagreeing with the guard at an abnormal rate — RAG context may be misaligned or critic prompt drifted. |
| Triage p99 latency with critic (5m) | ≤ 7000 ms | `histogram_quantile(0.99, sum(rate(agent_planning_loop_ms_bucket[5m])) by (le))` | CriticReview adds an extra LLM call; p99 ceiling raised from 5 s (P4.1) to 7 s to absorb it. |
| Eval harness accuracy (per run) | ≥ 90% pass | `agent_eval_pass_rate{suite="triage"}` gauge, sampled every 30 min | The scheduled harness runs the golden triage set; < 90% means recent prompt changes degraded accuracy. |
| AOAI capacity utilisation (5m) | < 80% TPM quota | `azure_openai_tpm_used / azure_openai_tpm_quota` (Azure Monitor metric, relabelled via OTEL pipeline) | Combined live+harness traffic must not saturate quota. |

Metric note: `agent_critic_rejected_total` / `agent_critic_reviewed_total` are emitted from `CriticAgent.ReviewAsync` in `src/HealthQCopilot.Agents/Services/Orchestration/CriticAgent.cs`. Verify they are populated in the first 5 minutes of the 5% soak before proceeding — if not, the AnalysisRun cannot make a pass/fail call and the rollout must pause for instrumentation repair.

---

## 5. Eval harness schedule

`HealthQ:ClinicalEval` enables the harness endpoint `POST /api/v1/governance/evaluate`. A Kubernetes `CronJob` (configured in `infra/k8s/eval-cronjob.yaml`) calls this endpoint every 30 minutes during the soak window with `body: {"suite":"triage"}`. Each run:

1. Loads the golden triage case set via `IClinicalCaseLoader`.
2. Drives `ClinicalEvaluator.EvaluateAsync("triage", ct)`.
3. Publishes the resulting `EvalReport` accuracy, groundedness, and toxicity metrics to the Prometheus push-gateway (or directly via OTel pipeline to `agent_eval_pass_rate`).

Manual trigger (smoke-test before AnalysisRun #1):

```bash
kubectl -n healthq-copilot exec deploy/healthq-agents -- \
  curl -s -X POST http://localhost:8080/api/v1/governance/evaluate \
    -H "Content-Type: application/json" \
    -d '{"suite":"triage"}'
```

Verify `EvalReport.PassRate ≥ 0.90` in the response body and `agent_eval_pass_rate{suite="triage"}` is present in Prometheus.

---

## 6. Pre-flight checklist

- [ ] P4.2 (`AgentHandoff`) at 100% for ≥ 24 h; P4.2 evidence captured.
- [ ] `infra/k8s/eval-cronjob.yaml` deployed and CronJob `healthq-eval-triage` in `healthq-copilot` namespace in `Scheduled` state.
- [ ] Manual eval harness smoke-test (§ 5) returns `passRate ≥ 0.90` against the current prod golden set.
- [ ] AOAI TPM quota headroom: current peak + estimated eval harness load (≈ case count × tokens/case every 30 min) + CriticReview overhead (≈ 1 extra call per triage) ≤ 80% TPM. Calculate before proceeding.
- [ ] `agent_critic_rejected_total` and `agent_critic_reviewed_total` metrics are visible in Prometheus (at least one data-point each from a staging warm-up run).
- [ ] Grafana `agent-quality.json` dashboard updated to show `agent_critic_rejection_rate` panel (add if missing — simple `sum(rate(...[5m]))/sum(rate(...[5m]))` expression against the `agent_critic_*` counters).
- [ ] On-call rotation acknowledged. PagerDuty silence not in effect.
- [ ] `agent_eval_pass_rate` alert (if configured in `recording-rules.yaml`) is routed to the `ai-engineering` channel, not the generic on-call.

---

## 7. Rollback triggers

Flat rollback (both flags to `WeightPercent=0`) on any of:

- AnalysisRun fails on any of the 5 P4.1 base metrics OR the 4 P4.3 overlay metrics.
- Eval harness returns `passRate < 0.80` (hard fail, 10% below threshold) on any scheduled run during the soak.
- `agent_critic_rejected_total` rate jumps > 30% for > 5 consecutive minutes (critic is systematically disagreeing with the guard — clinical safety risk).
- CriticAgent LLM call timeout rate > 5% for > 5 minutes (network / quota issue specific to the extra critic call, likely causing triage latency cascade).
- Any HIPAA / safety incident raised.
- ≥ 5 PagerDuty pages from `agent-quality` or `agent-cost` Grafana alerts in a soak window.

---

## 8. Evidence to capture

Save under `docs/compliance/evidence/p4.3-clinicaleval-critic-rollout/{yyyy-MM-dd}/`:

1. AnalysisRun outputs for all 3 phases.
2. Grafana snapshot of `agent-quality.json` covering the full 1h 45m window (including the `agent_critic_rejection_rate` panel).
3. Three `EvalReport` JSON responses from the CronJob (one per soak window) — verify `passRate ≥ 0.90` in each.
4. Grafana snapshot of `agent-cost.json` showing p99 cost per session (should be ≤ P4.2 baseline × 1.3 due to CriticReview extra call).
5. Kusto query for `consent_decision` events (EventType="consent_decision") from the soak window — proves W1.6b audit emission stayed clean through the cutover.
6. One sample triage trace where `Kind="critic_review"` step is present — fetched via `GET /api/v1/agents/traces/{sessionId}` — proves CriticReview fired in the canary cohort.
7. ConfigMap diff (off → 100%).

---

## 9. Steady-state operation after 100%

Once both flags are at 100% and stable for 24 h, the eval CronJob becomes the **primary continuous safety signal** for production prompt regressions. Operationally:

- A drop in `agent_eval_pass_rate{suite="triage"}` below 90% for 2 consecutive runs should trigger a `AgentEvalPassRateLow` Prometheus alert (add to `recording-rules.yaml`) routed to `ai-engineering`, not the generic on-call.
- Prompt bumps to the `triage-system-v1` prompt (`InMemoryPromptRegistry` / Cosmos-backed registry) MUST be preceded by a manual eval harness run proving `passRate ≥ 0.92` before merge to main — add a step to the PR checklist in `AGENTS.md` or `docs/compliance/runbooks/prompt-change-process.md` (create if absent).
- CriticReview rejection rate > 5% sustained for 1 h should trigger a review of the RAG context retrieval pipeline — the critic and the guard are likely seeing mismatched contexts.

---

## 10. Cross-references

- AnalysisTemplate: `infra/argocd/agent-rollout-analysis.yaml` (extend with critic overlay counters).
- Eval CronJob: `infra/k8s/eval-cronjob.yaml`.
- CriticAgent: `src/HealthQCopilot.Agents/Services/Orchestration/CriticAgent.cs` (W2.3).
- ClinicalEvaluator: `src/HealthQCopilot.Agents/Evaluation/ClinicalEvaluator.cs` (W3.1–W3.3).
- Governance endpoint: `src/HealthQCopilot.Agents/Endpoints/ModelGovernanceEndpoints.cs`.
- Predecessor runbook: `docs/compliance/runbooks/agent-handoff-rollout-p4.2.md`.
- Cost alerts: `infra/k8s/monitoring/recording-rules.yaml` (P4.4, turn `ak`).
- HIPAA evidence pack: `docs/compliance/HIPAA-Agentic-AI-Evidence-Pack.md`.
