# Runbook — PHI Egress Verification (Agentic AI)

**Owner**: Platform Compliance + AI Engineering  
**Cadence**: Pre-canary cutover (P4.1) and quarterly thereafter  
**Acceptance**: zero PHI matches in APIM diagnostic-log RequestBody for Azure OpenAI backends over a 1-hour synthetic-traffic window

This runbook implements the verification step referenced in [HIPAA-Agentic-AI-Evidence-Pack.md § 3.3](../HIPAA-Agentic-AI-Evidence-Pack.md). It proves at the network egress layer that the in-process redaction chain (`PresidioRedactor` → `RedactingLlmGateway` / `RedactingChatCompletionDecorator`) is actually scrubbing PHI before any byte reaches `*.openai.azure.com`.

---

## 1. Pre-conditions

- [ ] APIM diagnostic logging set to `verbosity: information` with `frontend` + `backend` request/response bodies sampled (sample rate ≥ 10% acceptable for the verification window; 100% recommended during the run).
- [ ] `HealthQ:PhiRedaction` flag **on** in the target environment.
- [ ] Synthetic-traffic generator targeted at the agentic-AI endpoints (`POST /api/v1/agents/triage`, `POST /api/v1/agents/coding`, `POST /api/v1/guide/conversations`) using the canonical `SYN-*` patient set from [tests/HealthQCopilot.Tests.Eval/GoldenSets/triage.json](../../../tests/HealthQCopilot.Tests.Eval/GoldenSets/triage.json) augmented with deliberately PHI-bearing transcripts (real-looking SSNs, MRNs, phones, emails — all synthetic).
- [ ] Baseline burn-in: at least 50 requests across all three endpoints to ensure non-zero traffic in the window.

## 2. Run the load

```powershell
# 50 RPS for 60 minutes against staging APIM
$apim = "https://apim-healthq-stage.azure-api.net"
$key  = $env:HEALTHQ_STAGE_APIM_KEY
.\scripts\synthetic-load.ps1 `
  -BaseUrl $apim `
  -ApiKey  $key `
  -Profile phi-egress-verification `
  -Rps     50 `
  -DurationMinutes 60
```

The `phi-egress-verification` profile mixes:

- 60% triage transcripts that mention SSN-like / MRN-like / phone-like patterns.
- 30% coding requests with patient names + DOBs.
- 10% guide chats with email addresses + addresses.

## 3. Verification queries (Application Insights / Log Analytics)

Run each query against the **APIM diagnostic-logs** workspace for the same one-hour window. Each query MUST return zero rows for the run to pass.

### 3.1 SSN pattern

```kusto
ApiManagementGatewayLogs
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"\b\d{3}-\d{2}-\d{4}\b"
| project TimeGenerated, OperationName, Url, RequestBody = substring(RequestBody, 0, 200)
```

### 3.2 MRN pattern

```kusto
ApiManagementGatewayLogs
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"\b(MRN[-:\s]?[A-Z0-9]{6,12}|[A-Z]{2}\d{6,8})\b"
| project TimeGenerated, OperationName, Url, RequestBody = substring(RequestBody, 0, 200)
```

### 3.3 Phone pattern

```kusto
ApiManagementGatewayLogs
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"\b(\+?1[-\s]?)?\(?\d{3}\)?[-\s.]?\d{3}[-\s.]?\d{4}\b"
| project TimeGenerated, OperationName, Url, RequestBody = substring(RequestBody, 0, 200)
```

### 3.4 Email pattern

```kusto
ApiManagementGatewayLogs
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
| project TimeGenerated, OperationName, Url, RequestBody = substring(RequestBody, 0, 200)
```

### 3.5 Date-of-birth (US format)

```kusto
ApiManagementGatewayLogs
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where BackendUrl has "openai.azure.com"
| where RequestBody matches regex @"\b(0?[1-9]|1[012])[/-](0?[1-9]|[12][0-9]|3[01])[/-](19|20)\d\d\b"
| project TimeGenerated, OperationName, Url, RequestBody = substring(RequestBody, 0, 200)
```

### 3.6 Cross-check: redaction-event volume

```kusto
// Confirms the redactor actually saw PHI in the same window
AppEvents
| where TimeGenerated between (datetime(<RUN_START>) .. datetime(<RUN_END>))
| where Name == "AuditEvent.PhiRedacted"
| summarize entitiesRedacted = sum(toint(Properties.redactionEntityCount)) by bin(TimeGenerated, 5m)
| order by TimeGenerated asc
```

Expectation: `entitiesRedacted > 0` in every 5-minute bucket of the run (≥ 50 RPS × redaction-rich profile). A **zero** bucket here while traffic is flowing indicates the redactor is bypassed — investigate before passing the egress check.

## 4. Pass / fail criteria

| Result | Status |
|---|---|
| All five PHI-pattern queries return 0 rows AND § 3.6 shows non-zero redactions | **PASS** — record screenshots + Kusto query URLs in the evidence pack appendix |
| Any pattern query returns ≥ 1 row | **FAIL** — capture full RequestBody, file P0 incident, roll back canary, do not promote |
| § 3.6 returns zero across the window | **INCONCLUSIVE** — redactor not exercised; rerun with a more PHI-heavy profile |

## 5. Evidence capture

- [ ] Export Kusto results as CSV → `docs/compliance/evidence/phi-egress-<YYYY-MM-DD>.csv`.
- [ ] Screenshot the Application Insights query pane for each of § 3.1–§ 3.6 → `docs/compliance/evidence/phi-egress-<YYYY-MM-DD>/*.png`.
- [ ] Append a row to the change log in [HIPAA-Agentic-AI-Evidence-Pack.md § 10](../HIPAA-Agentic-AI-Evidence-Pack.md).
- [ ] Update the Phase-3 verification checklist (P3.3 row) on the same pack.

## 6. Known limitations

1. **APIM diagnostic-log sampling** — at 10% sample rate, a single leak that happens to fall outside the sample is invisible. For pre-canary verification, set sampling to 100% for the duration of the run; revert afterwards to control storage cost.
2. **Regex patterns ≠ Presidio NER** — these queries detect *the obvious* PHI shapes that Presidio also catches. They will not catch free-form PHI the redactor itself missed (e.g. an unusual local identifier format). The unit-test suite (`PresidioRedactorTests`) is the primary defense for that class; this runbook is the network-layer cross-check.
3. **`BackendUrl has "openai.azure.com"`** assumes Azure OpenAI is the only backend in scope. If you wire a third-party model (e.g. Anthropic via APIM passthrough), extend the predicate.
4. **Body truncation** — APIM truncates RequestBody at ~16 KB. A leak that occurs only in the tail of a >16 KB request is invisible. Pair this runbook with the in-process `RedactingLlmGateway` unit tests, which see the full payload.
