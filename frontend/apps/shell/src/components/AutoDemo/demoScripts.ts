/**
 * Phase 58 — AI Self-Driven Live Demo Scripts
 *
 * Each workflow represents a major platform area.
 * Each scene navigates to a route, streams a narration, and optionally
 * hints at a UI element to look at.
 */

export interface DemoScene {
  id:          string;
  route:       string;
  title:       string;
  narration:   string;
  durationSec: number;
  highlightHint?: string;   // Human-readable "look here" instruction
}

export interface DemoWorkflow {
  id:          string;
  name:        string;
  icon:        string;       // emoji
  color:       string;       // MUI palette color token
  description: string;
  scenes:      DemoScene[];
}

export const DEMO_WORKFLOWS: DemoWorkflow[] = [
  // ── 1. Dashboard Overview ────────────────────────────────────────────────
  {
    id: 'dashboard',
    name: 'Command Center',
    icon: '🏥',
    color: '#1976d2',
    description: 'Real-time clinical KPIs across every department',
    scenes: [
      {
        id:          'dashboard-welcome',
        route:       '/',
        title:       'Welcome to HealthQ Copilot',
        narration:   'Welcome to HealthQ Copilot — the AI-powered command center for modern healthcare. This dashboard is your clinic\'s real-time nerve center, showing live performance across triage, scheduling, revenue, and population health in a single view.',
        durationSec: 30,
        highlightHint: 'Notice the KPI cards at the top — each one is live and clickable.',
      },
      {
        id:          'dashboard-kpis',
        route:       '/',
        title:       'Clinical AI KPIs',
        narration:   'The Clinical AI section tracks active triage cases and AI accuracy. Right now our model is running at 94% triage accuracy across all incoming cases. Scheduling shows today\'s slot utilization — currently at 87%, well above the 75% clinic average.',
        durationSec: 28,
        highlightHint: 'Scan the KPI row — green indicates healthy thresholds, amber requires attention.',
      },
      {
        id:          'dashboard-revenue',
        route:       '/',
        title:       'Revenue & Risk at a Glance',
        narration:   'Revenue KPIs show pending claims and average claim value. Population Health highlights the count of patients flagged as high-risk today. This single screen gives leadership everything needed to run a data-driven clinic — no spreadsheets, no manual reports.',
        durationSec: 28,
        highlightHint: 'The Revenue and Population Health cards feed directly from live AI models.',
      },
    ],
  },

  // ── 2. Voice AI Intake ──────────────────────────────────────────────────
  {
    id: 'voice',
    name: 'Voice AI Intake',
    icon: '🎙️',
    color: '#7b1fa2',
    description: 'Hands-free clinical documentation powered by speech AI',
    scenes: [
      {
        id:          'voice-session',
        route:       '/voice',
        title:       'Starting a Voice Session',
        narration:   'This is the Voice AI Intake module. Clinicians tap Record and speak naturally about a patient encounter. Our speech AI transcribes in real time, separating clinician speech from ambient noise, and begins building a structured clinical note as the words flow.',
        durationSec: 32,
        highlightHint: 'The large Record button at the top — tap it to start capturing speech.',
      },
      {
        id:          'voice-history',
        route:       '/voice',
        title:       'Session History',
        narration:   'The session history panel shows recent voice encounters with full clinical context. Alice Morgan\'s session from 14 minutes ago shows a diabetes management encounter — the AI transcribed 6 minutes of speech and produced a complete SOAP note automatically.',
        durationSec: 30,
        highlightHint: 'Session cards on the right show patient name, duration, and a transcript snippet.',
      },
      {
        id:          'voice-ai-note',
        route:       '/voice',
        title:       'AI-Generated Clinical Note',
        narration:   'After transcription, the AI Clinical Note shows a fully structured note: chief complaint, history of present illness, assessment, and plan — all extracted from spoken words alone. Clinicians review and approve in under 60 seconds, saving 20 to 30 minutes of documentation time per encounter.',
        durationSec: 35,
        highlightHint: 'The AI Note tab shows the structured SOAP note ready for clinician approval.',
      },
    ],
  },

  // ── 3. AI Clinical Triage ───────────────────────────────────────────────
  {
    id: 'triage',
    name: 'AI Clinical Triage',
    icon: '🚨',
    color: '#d32f2f',
    description: 'AI-ranked acuity queue with explainable reasoning',
    scenes: [
      {
        id:          'triage-queue',
        route:       '/triage',
        title:       'The Triage Queue',
        narration:   'This is AI-Powered Clinical Triage. Every incoming case is ranked by an AI acuity score derived from vitals, symptom severity, patient history, and social risk factors. Red P1 cases at the top require immediate attention — the model detected critical indicators like chest pain with radiation in the arm.',
        durationSec: 35,
        highlightHint: 'P1 cases glow red at the top of the queue — they are ranked by AI acuity score.',
      },
      {
        id:          'triage-reasoning',
        route:       '/triage',
        title:       'Explainable AI Reasoning',
        narration:   'Clicking any case reveals the AI\'s full reasoning: the specific clinical signals detected, confidence scores for each indicator, and the recommended care pathway with estimated urgency window. This explainable AI is critical for clinician trust — they never have to take the AI\'s word alone.',
        durationSec: 35,
        highlightHint: 'The AI Reasoning section shows exactly why the case was ranked P1 or P2.',
      },
      {
        id:          'triage-resolve',
        route:       '/triage',
        title:       'Claim and Resolve',
        narration:   'When a clinician claims a case, it locks to their panel. The AI pre-suggests ICD-10 codes and drafts a clinical note. Resolving the case triggers automatic handoff to Scheduling and Revenue Cycle — closing the care loop with zero manual steps. From intake to billing, HealthQ Copilot connects it all.',
        durationSec: 32,
        highlightHint: 'The Claim button transfers ownership; Resolve triggers downstream workflows.',
      },
    ],
  },

  // ── 4. Smart Scheduling ─────────────────────────────────────────────────
  {
    id: 'scheduling',
    name: 'Smart Scheduling',
    icon: '📅',
    color: '#2e7d32',
    description: 'AI-optimized appointment slots and waitlist management',
    scenes: [
      {
        id:          'scheduling-calendar',
        route:       '/scheduling',
        title:       'AI-Optimised Slot Calendar',
        narration:   'The Smart Scheduling module shows today\'s appointment calendar with AI-optimised slot allocation. The AI balances clinician availability, patient acuity, travel time, and appointment type to minimise gaps and maximise throughput — automatically, without manual configuration.',
        durationSec: 32,
        highlightHint: 'Green slots are available, blue are booked — the AI colour-codes by status.',
      },
      {
        id:          'scheduling-book',
        route:       '/scheduling',
        title:       'Booking for Alice Morgan',
        narration:   'Booking a follow-up for Alice Morgan — our high-risk diabetes patient — takes seconds. The AI pre-selects the optimal slot based on her medication schedule, proximity to her next HbA1c lab, and her transport availability captured from the SDOH assessment. One click, perfectly timed.',
        durationSec: 32,
        highlightHint: 'Select patient PAT-00142, then pick a slot — the AI highlights the best one.',
      },
      {
        id:          'scheduling-waitlist',
        route:       '/scheduling',
        title:       'Intelligent Waitlist',
        narration:   'The waitlist automatically re-assigns freed slots to the highest-priority waiting patient. High-risk patients jump the queue using their AI risk score. In pilot clinics this has reduced no-shows by 34 percent and pushed slot utilisation above 90 percent — generating significant additional revenue.',
        durationSec: 32,
        highlightHint: 'The Waitlist panel shows patients ranked by AI risk — highest priority at top.',
      },
    ],
  },

  // ── 5. Clinical Encounters ──────────────────────────────────────────────
  {
    id: 'encounters',
    name: 'Clinical Encounters',
    icon: '🩺',
    color: '#00796b',
    description: 'Full patient record with AI-powered clinical decision support',
    scenes: [
      {
        id:          'encounters-summary',
        route:       '/encounters',
        title:       'Patient At-a-Glance',
        narration:   'The Clinical Encounters module opens with an AI-powered patient summary card. For Alice Morgan — 58 years old with Type 2 Diabetes, Hypertension, and CKD Stage 2 — the ML readmission risk score is 72 percent, placing her in the High risk tier. This triggers automatic proactive care coordination protocols.',
        durationSec: 38,
        highlightHint: 'The Patient Summary Card at the top shows risk score, conditions, meds, and allergies.',
      },
      {
        id:          'encounters-history',
        route:       '/encounters',
        title:       'Encounter History & AI Flags',
        narration:   'The encounter list shows every visit with AI-generated flags for follow-up actions. Overdue HbA1c labs, medication renewals approaching expiry, and unresolved care plan items are surfaced automatically so nothing falls through the cracks in a busy clinic.',
        durationSec: 32,
        highlightHint: 'AI flags appear as coloured chips on each encounter card — click one to expand.',
      },
      {
        id:          'encounters-meds',
        route:       '/encounters',
        title:       'Medications, Allergies & Drug Checks',
        narration:   'The Medication Panel shows Alice\'s 4 active medications with real-time drug interaction screening. When prescribing anything new, the AI cross-checks against her 2 documented allergies and current regimen instantly. Interaction alerts are graded by severity — clinicians are never flying blind.',
        durationSec: 35,
        highlightHint: 'The Medications and Allergies tabs sit side by side — toggle between them.',
      },
    ],
  },

  // ── 6. Revenue Cycle ────────────────────────────────────────────────────
  {
    id: 'revenue',
    name: 'Revenue Cycle AI',
    icon: '💰',
    color: '#f57c00',
    description: 'AI coding, prior auth, and denial management',
    scenes: [
      {
        id:          'revenue-queue',
        route:       '/revenue',
        title:       'AI Coding Queue',
        narration:   'The Revenue Cycle module shows pending clinical coding jobs. Our AI analyses each encounter note and suggests ICD-10 and CPT codes ranked by confidence score. Cases are queued for a single-click clinician approval — turning hours of coding work into minutes.',
        durationSec: 30,
        highlightHint: 'Each coding job card shows suggested codes with confidence percentages.',
      },
      {
        id:          'revenue-approve',
        route:       '/revenue',
        title:       'One-Click Code Approval',
        narration:   'Reviewing Alice Morgan\'s encounter — the AI suggested four ICD-10 codes: E11.65 for Type 2 Diabetes with hyperglycaemia, I10 for Hypertension, N18.2 for CKD Stage 2, and Z87.891 for personal history of nicotine dependence. AI coding accuracy in this clinic runs at 94 percent. Click Approve to submit.',
        durationSec: 38,
        highlightHint: 'Click Approve Codes — the AI has already validated all four suggested codes.',
      },
      {
        id:          'revenue-denials',
        route:       '/revenue',
        title:       'Denial Recovery & Prior Auth',
        narration:   'The Denial Manager uses AI to analyse rejected claims and generate appeal evidence packages. On average, 68 percent of initially denied claims are recovered. Prior Auth Tracker proactively identifies cases that need pre-authorisation — eliminating surprise denials before the claim is even submitted.',
        durationSec: 35,
        highlightHint: 'The Denial Manager tab shows pending appeals with AI-suggested evidence attachments.',
      },
    ],
  },

  // ── 7. Population Health ────────────────────────────────────────────────
  {
    id: 'pophealth',
    name: 'Population Health',
    icon: '📊',
    color: '#1565c0',
    description: 'Risk stratification, HEDIS measures, and SDOH screening',
    scenes: [
      {
        id:          'pophealth-risk',
        route:       '/population-health',
        title:       'Patient Risk Stratification',
        narration:   'Population Health gives a bird\'s-eye view of your entire patient panel. The ML risk model continuously monitors lab trends, encounter frequency, medication adherence, and social risk indicators to produce a live risk score for every patient — flagging deterioration before it becomes an emergency.',
        durationSec: 35,
        highlightHint: 'The Risk Panel shows patients in Critical, High, and Low risk bands — sorted by score.',
      },
      {
        id:          'pophealth-hedis',
        route:       '/population-health',
        title:       'HEDIS Quality Measures',
        narration:   'HEDIS quality measures track your performance on Comprehensive Diabetes Care, Controlling High Blood Pressure, Breast Cancer Screening, and more. Alice Morgan appears in the Diabetes Care gap. The AI has already scheduled her for the missing HbA1c test and retinal exam — closing the gap automatically.',
        durationSec: 38,
        highlightHint: 'HEDIS cards show your clinic\'s performance vs. national benchmarks — gaps highlighted in red.',
      },
      {
        id:          'pophealth-sdoh',
        route:       '/population-health',
        title:       'Social Determinants of Health',
        narration:   'SDOH screening captures hidden risk factors — transportation barriers, food insecurity, housing instability, and social isolation. These are linked directly to care coordination workflows. Addressing social determinants reduces avoidable readmissions by up to 40 percent — and HealthQ Copilot integrates it seamlessly into every patient encounter.',
        durationSec: 38,
        highlightHint: 'The SDOH Assessment Panel shows risk domains with colour-coded severity levels.',
      },
    ],
  },

  // ── 8. Patient Engagement ───────────────────────────────────────────────
  {
    id: 'engagement',
    name: 'Patient Engagement',
    icon: '💬',
    color: '#6a1b9a',
    description: 'HIPAA-compliant portal, campaigns, and proactive outreach',
    scenes: [
      {
        id:          'engagement-portal',
        route:       '/patient-portal',
        title:       'Patient Portal & Registration',
        narration:   'The Patient Engagement hub manages every patient-facing touchpoint. Digital registration, consent management, OTP verification, and GDPR erasure requests are all handled through HIPAA-compliant channels. Patients can self-register in under 3 minutes — no paperwork, no front-desk queues.',
        durationSec: 32,
        highlightHint: 'The Patient Portal shows registration status, consent flags, and portal access.',
      },
      {
        id:          'engagement-campaigns',
        route:       '/patient-portal',
        title:       'AI Campaign Manager',
        narration:   'The Campaign Manager sends personalised care reminders at scale. AI segments patients by risk level, care gaps, and preferred communication channel — then delivers targeted messages via SMS, email, or push notification. Average engagement rate in production clinics is 73 percent — far above industry average of 22 percent.',
        durationSec: 35,
        highlightHint: 'The Campaign Manager tab shows active campaigns with live open and response rates.',
      },
      {
        id:          'engagement-analytics',
        route:       '/patient-portal',
        title:       'Delivery Analytics & Outcomes',
        narration:   'Real-time delivery analytics show message open rates, response rates, and care action completion rates. The AI continuously learns from engagement patterns to optimise timing and message content for each patient segment. This closes the loop between outreach and clinical outcomes — completing the full HealthQ Copilot care cycle.',
        durationSec: 35,
        highlightHint: 'Delivery Analytics shows the funnel from message sent to care action completed.',
      },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

export const TOTAL_SCENES = DEMO_WORKFLOWS.reduce((acc, w) => acc + w.scenes.length, 0);

export function getGlobalSceneIndex(workflowIdx: number, sceneIdx: number): number {
  let idx = 0;
  for (let w = 0; w < workflowIdx; w++) idx += DEMO_WORKFLOWS[w].scenes.length;
  return idx + sceneIdx;
}

export function getTotalWorkflows(): number {
  return DEMO_WORKFLOWS.length;
}
