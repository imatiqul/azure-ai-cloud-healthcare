# Healthcare AI — Next Phases Implementation Plan

> **Baseline (committed):** All 12 microservices on Azure Container Apps · All 8 MFEs on Azure Static Web Apps · Auth wiring complete (MSAL + Entra JWT) · Voice triage UX fixed (user-driven navigation)

---

## Phase 1 — Real-Data De-Stubbing ✅ (Days 1–5)

Remove every `DEMO_*` constant from all MFEs and replace with proper API/GraphQL calls plus real error states.

| File | Change |
|------|--------|
| `revenue-mfe/CodingQueue.tsx` | `DEMO_CODING_ITEMS` removed; catch sets `fetchError` state instead |
| `revenue-mfe/PriorAuthTracker.tsx` | `DEMO_PRIOR_AUTHS` removed; catch sets `fetchError` |
| `revenue-mfe/DenialManager.tsx` | `DEMO_DENIALS` + `DEMO_ANALYTICS` removed; catch sets `fetchError` |
| `pophealth-mfe/RiskPanel.tsx` | `DEMO_RISKS` removed; catch shows error Alert, empty state |
| `pophealth-mfe/CareGapList.tsx` | `DEMO_GAPS` removed; loading + error state added |
| `shell/ClinicalAlertsCenter.tsx` | All 4 DEMO constants removed; empty arrays on failure |

**Error UX pattern** applied consistently across all components:
- Loading spinner while fetching
- `<Alert severity="error">` with dismiss on failure
- Empty state message ("No items found") when API returns empty array
- No fabricated data shown to users

---

## Phase 2 — End-to-End Clinical Workflow Wiring ✅ (Days 3–8)

### 2.1 — `triageContextSet` Cross-MFE Event

Added to `@healthcare/mfe-events`:

```typescript
// New event type
export interface TriageContextSetDetail {
  sessionId: string;
  triageLevel: string;
  agentReasoning?: string;
  recommendedSpecialty?: string;
  confidenceScore?: number;
  patientId?: string;
  patientName?: string;
}

// New event name
MFE_EVENTS.TRIAGE_CONTEXT_SET = 'mfe:triage:context'

// New helpers
emitTriageContextSet(detail: TriageContextSetDetail)
onTriageContextSet(handler)
```

### 2.2 — Voice → Triage handoff

`VoiceSessionController.tsx` "Continue to Triage →" button now:
1. Emits `triageContextSet` with `{ sessionId, triageLevel, agentReasoning, recommendedSpecialty, confidenceScore }`
2. Calls `selectShellTab('hq:tab-triage', 0)`
3. Emits `navigationRequested({ path: '/triage' })`

### 2.3 — TriageViewer pre-population

`TriageViewer.tsx` subscribes to `onTriageContextSet`:
- Calls `persistWorkflow()` to save context to session storage
- Calls `integrateWorkflow()` to merge the new workflow card into the list immediately
- No round-trip to backend needed — appears instantly when user arrives at /triage

---

## Phase 3 — FHIR Patient Context (Days 6–12)

### 3.1 — PatientContextBar → Real FHIR

Wire `shell/PatientContextBar.tsx` to `GET /api/v1/fhir/patients/{id}`:
- Auto-populate from `onPatientSelected` event
- Display: name, MRN, DOB, allergies, active conditions summary
- Persist `patientId` in Zustand global store
- Emit `patientSelected` when user picks a patient from search

### 3.2 — PatientSearch component

Build `pophealth-mfe/PatientSearch.tsx`:
- GraphQL `searchPatients(query: String!)` query
- Debounced input (300 ms)
- Results show name, MRN, risk score badge
- On select: emit `patientSelected`, update context bar

### 3.3 — FHIR document viewer

Build `triage-mfe/FhirDocumentPanel.tsx`:
- Fetch `GET /api/v1/fhir/patients/{id}/documents` (HAPI FHIR R4 `DocumentReference`)
- Render latest 5 clinical notes as expandable cards
- Link to FHIR DocumentReference PDF viewer

---

## Phase 4 — Scheduling MFE Completeness (Days 8–14)

### 4.1 — Slot availability calendar

`scheduling-mfe/SlotCalendar.tsx`:
- Query `GET /api/v1/scheduling/slots?date={date}&specialty={specialty}&top=20`
- Weekly calendar grid (MUI `DateCalendar` + custom slot cells)
- Color coding: available (green), waitlist (amber), blocked (gray)
- On slot click: emit `slotReserved({ slotId, patientId, practitionerId })`

### 4.2 — Booking form pre-fill from triage

`BookingForm.tsx` already subscribes to `onSlotReserved` and reads `getActiveWorkflowHandoff()`. Extend:
- Auto-select specialty from `triageResult.recommendedSpecialty`
- Auto-set urgency from `triageLevel` (P1 → Urgent, P2 → Same-day, P3 → Routine)
- Show "Suggested by AI Triage" chip on pre-filled fields

### 4.3 — Waitlist management

`scheduling-mfe/WaitlistPanel.tsx`:
- Poll `GET /api/v1/scheduling/waitlist?status=Waiting` every 30 s
- Manual re-order drag-and-drop (MUI DnD or `@dnd-kit`)
- "Promote from waitlist" → creates booking automatically

---

## Phase 5 — Population Health Analytics (Days 10–18)

### 5.1 — Risk trajectory sparklines

`pophealth-mfe/RiskTrajectoryPanel.tsx`:
- Query `patientRiskHistory(patientId: String!, days: Int!)` GraphQL
- Render mini sparkline chart per patient using `recharts`
- Trend arrow indicator (improving / stable / deteriorating)

### 5.2 — HEDIS measures dashboard

`pophealth-mfe/HedisMeasuresPanel.tsx`:
- Fetch `GET /api/v1/population-health/hedis?measureSet=2025`
- Render compliance % bar per measure category
- Drill-down: click measure → list of non-compliant patients

### 5.3 — SDOH assessment

`pophealth-mfe/SdohAssessmentPanel.tsx`:
- Fetch `GET /api/v1/population-health/sdoh-assessments?patientId={id}`
- Render domain wheel (Housing, Food, Transport, Social, Economic)
- CTA: "Refer to Community Resource" → POST to `/api/v1/notifications/send`

### 5.4 — Cost prediction

`pophealth-mfe/CostPredictionPanel.tsx`:
- Fetch `GET /api/v1/population-health/cost-predictions?patientId={id}`
- Display: predicted 12-month cost, top cost drivers, intervention savings estimate
- Spark chart: monthly cost trend

---

## Phase 6 — Revenue Cycle Completeness (Days 14–22)

### 6.1 — Denial analytics charts

`revenue-mfe/DenialManager.tsx` — extend analytics section:
- Pie chart: denials by category (Coding / Coverage / Medical Necessity / Billing)
- Bar chart: month-over-month overturn rate trend
- KPI: average days-to-resolve

### 6.2 — Prior auth appeal workflow

`revenue-mfe/PriorAuthTracker.tsx` — add appeal modal:
- Fetch denial reason from `GET /api/v1/revenue/prior-auths/{id}`
- AI-suggested appeal letter (call `POST /api/v1/agents/appeal-letter`)
- Submit to `PUT /api/v1/revenue/prior-auths/{id}/appeal`

### 6.3 — Claim submission pipeline

`revenue-mfe/CodingQueue.tsx` — extend Submit Claim flow:
- After approval: `POST /api/v1/revenue/claims` with approved ICD-10 + CPT codes
- Track claim status via polling `GET /api/v1/revenue/claims/{id}/status`
- Show payer acknowledgement number when returned

---

## Phase 7 — Infrastructure & CI/CD Hardening (Days 18–28)

### 7.1 — Fix OIDC Federation (CRITICAL BLOCKER)

The GitHub Actions deploy identity has `AADSTS700213` — federated credential subject mismatch.

**Azure Portal steps:**
1. Go to **Entra ID → App registrations → `healthq-copilot-deploy`**
2. Select **Certificates & secrets → Federated credentials**
3. Delete the broken credential
4. Click **Add credential** → GitHub Actions
5. Set:  
   - Organization: `imatiqul`  
   - Repository: `azure-ai-cloud-healthcare`  
   - Entity type: **Branch**  
   - Branch: `main`
6. Save — the subject will be `repo:imatiqul/azure-ai-cloud-healthcare:ref:refs/heads/main`

### 7.2 — Fix Gateway 404s

Missing routes in `appsettings.Production.json`:

```json
{
  "path": "/api/v1/revenue/denials/analytics",
  "target": "http://healthqcopilot-revenue:8080/api/v1/revenue/denials/analytics"
},
{
  "path": "/api/v1/notifications/analytics/delivery",
  "target": "http://healthqcopilot-notifications:8080/api/v1/notifications/analytics/delivery"
}
```

### 7.3 — Observability

- Enable Application Insights distributed tracing on all ACA services
- Add `OpenTelemetry` SDK to each .NET microservice (`Microsoft.Extensions.Logging.ApplicationInsights`)
- Create Azure Monitor dashboard: request latency p50/p95, error rate, ACA replica count
- Set alert rules: error rate > 5%, latency p95 > 2 s

### 7.4 — Secrets management

- Move all connection strings from `appsettings.json` to **Azure Key Vault**
- Use Dapr secrets component: `component: secretstore.azure-keyvault`
- Rotate PostgreSQL credentials on first deploy

---

## Phase 8 — AI & RAG Improvements (Days 22–35)

### 8.1 — Vector search quality

- Embed FHIR clinical notes using `text-embedding-ada-002` → store in Qdrant
- Improve RAG chunking: sentence-aware splitter (1024 tokens, 128 overlap)
- Add BM25 hybrid search: `Qdrant.Client.Grpc.SearchPointsRequest` with `with_lookup`

### 8.2 — Semantic Kernel plugin expansion

Add plugins to `HealthQCopilot.Agents`:
- `FhirPlugin` — query HAPI FHIR R4 patient records
- `ClinicalGuidelinesPlugin` — search embedded NICE/AHA guideline PDFs
- `DrugInteractionPlugin` — call FDA API for contraindication checks

### 8.3 — Prompt optimization

- Use Semantic Kernel's `PromptExecutionSettings.Temperature = 0.1` for triage (deterministic)
- Add few-shot examples to triage system prompt from curated MIMIC-III cases
- A/B test: measure P1 sensitivity / specificity vs. clinical ground truth

### 8.4 — AI guardrails

- Implement `ContentSafetyService` using Azure Content Safety API
- Block PII leakage in AI outputs (regex + named entity masking)
- Audit log all AI decisions to `HealthQCopilot.AuditLog` table in PostgreSQL

---

## Dependency Map

```
Phase 1 (de-stubbing) → Phase 3 (FHIR context) → Phase 5 (PopHealth analytics)
Phase 2 (workflow wiring) → Phase 4 (Scheduling completeness) → Phase 6 (Revenue cycle)
Phase 7.1 (OIDC fix) → all ACA deployments unblocked
Phase 7.2 (gateway) → Phase 3, 5, 6 (prevent 404s)
Phase 8 (AI/RAG) → independent, can run in parallel
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| DEMO_* constants remaining | 0 |
| API error states covered | 100% of data-fetching components |
| Voice → Triage → Scheduling E2E | < 3 clicks, < 5 s total |
| FHIR patient context load | < 1.5 s |
| AI triage P1 sensitivity | ≥ 92% |
| Gateway 404 endpoints | 0 |
| ACA deployment via CI/CD | Green on push to `main` |
| Application Insights coverage | 100% of microservices |

---

*Last updated: Phase 1 + Phase 2 partially implemented (real-data de-stubbing complete, triageContextSet event wired).*
