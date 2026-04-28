/**
 * P3.2 — Agent planning-loop load test (50 RPS sustained, p99 < 5 s).
 *
 * Drives the production-shaped triage path (/api/v1/agents/triage), which
 * exercises the full chain: PHI redactor → consent gate → AgentPlanningLoop
 * (W2.6 budget tracker) → Hallucination guard → Critic agent (when flag on)
 * → audit emission → trace recorder.
 *
 * Acceptance criteria pinned by Phase 3 of plan.md:
 *   • p99(http_req_duration) < 5000ms over the 5-min sustained window
 *   • errors < 1% (budget exhaustion is NOT an error — loop returns 201
 *     with goalMet=false; only 5xx counts as error here)
 *   • At least 1% of sessions trip a budget_* outcome — proves the W2.6
 *     enforcement path is exercised under realistic load (deliberate
 *     ambiguous-symptom inputs designed to stretch the loop)
 *
 * Run (against staging with real Azure OpenAI):
 *   k6 run --env BASE_URL=https://staging-agents.healthq.local \
 *          --env AGENT_URL=https://staging-agents.healthq.local \
 *          tests/load/agent-planning-loop.js
 *
 * Default profile: 30s ramp → 5m sustained @ 50 RPS → 30s cool-down.
 *
 * Evidence to capture (see docs/compliance/runbooks/agent-planning-loop-load-test.md):
 *   • k6 summary.json (latency percentiles, error rate)
 *   • Grafana `agent-quality.json` panel snapshot for the test window
 *     (planning-loop p99 + outcome breakdown)
 *   • Kusto query against agent_planning_loop_ms histogram filtered to
 *     `outcome startswith "budget_"` — must be non-empty.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const triageLatency = new Trend('triage_latency_ms', true);
const errorRate = new Rate('triage_error_rate');
const budgetExhausted = new Counter('budget_exhausted_count');
const goalMetCount = new Counter('goal_met_count');

// 50 RPS sustained over 5 min with constant-arrival-rate so the test does NOT
// throttle on response time — we want queue-up to surface as latency, not
// reduced offered load. preAllocatedVUs sized for ~p99=5s headroom.
export const options = {
  scenarios: {
    sustained_50rps: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 300,
      maxVUs: 500,
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // Phase-3 SLO: p99 of the planning loop end-to-end < 5s.
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    triage_latency_ms: ['p(99)<5000'],
    // Treat 5xx (and only 5xx) as a failure. 200/201 with goalMet=false on
    // budget exhaustion is the documented partial-result contract from W2.6.
    triage_error_rate: ['rate<0.01'],
  },
};

const AGENT_URL = __ENV.AGENT_URL || __ENV.BASE_URL || 'http://localhost:5002';

// Mix of inputs:
//   - 60% normal acuity (loop should converge in 1–2 iterations)
//   - 30% ambiguous (forces multi-step reflection — exercises iteration budget)
//   - 10% adversarial / very-long (exercises wall-clock + token budget)
// All inputs are SYNTHETIC — no PHI. patientId prefix `SYN-LOAD-` exempts the
// consent gate (DefaultConsentService grants `SYN-*` patients per W1.6).
const inputs = [
  // Normal — acute
  'Adult patient reports crushing substernal chest pressure radiating to left arm, diaphoretic.',
  'Patient presents with acute shortness of breath and unilateral leg swelling.',
  'Severe headache, photophobia, neck stiffness, fever 39.2C.',
  // Normal — routine
  'Patient requests refill of seasonal allergy antihistamine, no new symptoms.',
  'Routine annual physical scheduling request, no acute complaints.',
  'Patient reports mild seasonal cough, afebrile, no shortness of breath.',
  // Ambiguous — forces reflection
  'Patient describes "feeling weird" intermittently for two weeks, vague chest discomfort, sometimes dizzy, sometimes not, comes and goes.',
  'Recurrent abdominal pain, location varies, sometimes after meals, sometimes not, no clear pattern, mild nausea.',
  'Fatigue and brain fog over months, multiple normal prior workups, patient anxious about underlying cause.',
  // Adversarial — long, designed to stretch token budget
  'Patient is a 67-year-old with a history of hypertension, type 2 diabetes, prior anterior MI five years ago with stent, paroxysmal atrial fibrillation on apixaban, stage 3a CKD, mild COPD, and obstructive sleep apnea on CPAP. Presents today with progressive dyspnea on exertion over six weeks, now occurring after one flight of stairs, intermittent palpitations, bilateral lower extremity edema, two-pillow orthopnea, occasional wheeze, and a dry cough. No chest pain. No fever. Recent medication change: lisinopril stopped two weeks ago due to cough; switched to losartan. Vitals on arrival: BP 158/94, HR 98 irregular, SpO2 92% on room air, weight up 4 kg from baseline.',
];

function pickInput() {
  return inputs[Math.floor(Math.random() * inputs.length)];
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function () {
  const sessionId = uuidv4();
  const payload = JSON.stringify({
    sessionId,
    patientId: `SYN-LOAD-${sessionId.slice(0, 8)}`,
    transcriptText: pickInput(),
  });

  const start = Date.now();
  const res = http.post(`${AGENT_URL}/api/v1/agents/triage`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '15s',
  });
  const elapsed = Date.now() - start;
  triageLatency.add(elapsed);

  const ok = res.status === 200 || res.status === 201;
  errorRate.add(!ok);
  check(res, {
    'triage status 2xx': () => ok,
    'response under 5s': () => elapsed < 5000,
  });

  // Tag budget-exhaustion vs goal-met outcomes. The triage response body
  // carries reasoningSteps when goal_met=false — we infer the budget path
  // from the [BUDGET EXHAUSTED] marker the loop appends in W2.6.
  if (ok && res.body) {
    const body = res.body.toString();
    if (body.indexOf('[BUDGET EXHAUSTED]') >= 0) {
      budgetExhausted.add(1);
    } else if (body.indexOf('goalMet') >= 0 || body.indexOf('triageLevel') >= 0) {
      goalMetCount.add(1);
    }
  }
}

export function handleSummary(data) {
  return {
    'tests/load/results/agent-planning-loop-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const p99 = m.http_req_duration?.values?.['p(99)'] ?? 0;
  const p95 = m.http_req_duration?.values?.['p(95)'] ?? 0;
  const errs = m.triage_error_rate?.values?.rate ?? 0;
  const budget = m.budget_exhausted_count?.values?.count ?? 0;
  const goal = m.goal_met_count?.values?.count ?? 0;
  const total = budget + goal;
  const budgetPct = total > 0 ? ((budget / total) * 100).toFixed(2) : '0.00';
  return [
    '',
    '=== P3.2 Agent Planning Loop Load Test ===',
    `  http_req_duration p95 = ${p95.toFixed(0)} ms (target < 3000)`,
    `  http_req_duration p99 = ${p99.toFixed(0)} ms (target < 5000)`,
    `  error rate            = ${(errs * 100).toFixed(2)} % (target < 1%)`,
    `  budget-exhausted hits = ${budget} (${budgetPct}% of completed sessions)`,
    `  goal-met sessions     = ${goal}`,
    '',
  ].join('\n');
}
