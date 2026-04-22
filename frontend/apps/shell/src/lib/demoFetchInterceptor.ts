/**
 * demoFetchInterceptor.ts
 *
 * Installs a global fetch monkey-patch that intercepts every /api/v1/* request
 * and returns realistic demo data instead of hitting the (unavailable) backend.
 *
 * Installed once at app startup via main.tsx — import MUST come before React render.
 *
 * Design notes
 * ─────────────
 * • Only intercepts GET requests to /api/v1/* by default.
 *   POST / PUT / DELETE requests return 200 OK with { success: true } so that
 *   optimistic-UI confirm paths work without throwing.
 * • Each dataset is diverse and uses realistic clinical identifiers.
 * • Simulates a tiny network delay (50-120 ms) so loading skeletons are visible.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(d: number) {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}
function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}
function daysFromNow(d: number) {
  return new Date(Date.now() + d * 86_400_000).toISOString().split('T')[0];
}

function ok(body: unknown, delay = 60): Promise<Response> {
  const json = JSON.stringify(body);
  return new Promise(resolve =>
    setTimeout(() => {
      resolve(
        new Response(json, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }, delay + Math.random() * 60),
  );
}

function noContent(delay = 60): Promise<Response> {
  return new Promise(resolve =>
    setTimeout(() => resolve(new Response(null, { status: 204 })), delay),
  );
}

// ── Demo datasets ─────────────────────────────────────────────────────────────

const TRIAGE_WORKFLOWS = [
  { id: 'tw-001', sessionId: 'sess-7f3a', status: 'AwaitingHumanReview', triageLevel: 'P1_Immediate', agentReasoning: 'Chest pain + dyspnoea — STEMI protocol initiated.', createdAt: minutesAgo(8) },
  { id: 'tw-002', sessionId: 'sess-2b9c', status: 'Processing',           triageLevel: 'P2_Urgent',   agentReasoning: 'Elevated troponin, pending echo correlation.',  createdAt: minutesAgo(22) },
  { id: 'tw-003', sessionId: 'sess-4e1d', status: 'Completed',            triageLevel: 'P3_Standard', agentReasoning: 'Routine hypertension follow-up, BP 145/92.',     createdAt: hoursAgo(1) },
  { id: 'tw-004', sessionId: 'sess-9a5f', status: 'AwaitingHumanReview', triageLevel: 'P1_Immediate', agentReasoning: 'Anaphylaxis — epinephrine administered, observe.', createdAt: minutesAgo(5) },
  { id: 'tw-005', sessionId: 'sess-3c8b', status: 'Completed',            triageLevel: 'P2_Urgent',   agentReasoning: 'Appendicitis suspected — surgical consult placed.', createdAt: hoursAgo(2) },
  { id: 'tw-006', sessionId: 'sess-6d2e', status: 'Processing',           triageLevel: 'P3_Standard', agentReasoning: 'Mild URI symptoms — telehealth follow-up booked.',  createdAt: hoursAgo(3) },
];

const AGENT_STATS = {
  pendingTriage: 8,
  awaitingReview: 3,
  completed: 47,
  totalSessions: 58,
  averageResolutionMinutes: 14,
};

const SCHEDULING_STATS = {
  availableToday: 23,
  bookedToday: 41,
  cancellations: 4,
  utilizationRate: 64,
};

const POP_HEALTH_STATS = {
  highRiskPatients: 127,
  HighRiskPatients: 127,
  openCareGaps: 84,
  OpenCareGaps: 84,
  closedCareGaps: 52,
  ClosedCareGaps: 52,
  totalPatients: 451,
  TotalPatients: 451,
  interventionsDue: 31,
  chronicConditionsManaged: 412,
};

const REVENUE_STATS = {
  codingQueue: 31,
  priorAuthsPending: 12,
  denialRate: 8.4,
  claimsSubmittedToday: 73,
};

const RISK_PATIENTS = [
  { id: 'r-001', patientId: 'PAT-00142', patientName: 'Sarah Mitchell',    level: 'Critical', riskLevel: 'Critical', riskScore: 0.94, conditions: ['HF', 'CKD'],         assessedAt: hoursAgo(2) },
  { id: 'r-002', patientId: 'PAT-00278', patientName: 'David Okafor',      level: 'Critical', riskLevel: 'Critical', riskScore: 0.91, conditions: ['COPD', 'T2DM'],       assessedAt: hoursAgo(3) },
  { id: 'r-003', patientId: 'PAT-00391', patientName: 'Maria Gonzalez',    level: 'High',     riskLevel: 'High',     riskScore: 0.82, conditions: ['CAD', 'HTN'],          assessedAt: hoursAgo(5) },
  { id: 'r-004', patientId: 'PAT-00554', patientName: 'James Patel',       level: 'High',     riskLevel: 'High',     riskScore: 0.79, conditions: ['T2DM', 'Obesity'],     assessedAt: hoursAgo(6) },
  { id: 'r-005', patientId: 'PAT-00619', patientName: 'Linda Nguyen',      level: 'High',     riskLevel: 'High',     riskScore: 0.76, conditions: ['HTN', 'Dyslipidemia'], assessedAt: hoursAgo(8) },
  { id: 'r-006', patientId: 'PAT-00731', patientName: 'Robert Chen',       level: 'Moderate', riskLevel: 'Moderate', riskScore: 0.58, conditions: ['Asthma'],              assessedAt: hoursAgo(10) },
  { id: 'r-007', patientId: 'PAT-00842', patientName: 'Angela Thompson',   level: 'Moderate', riskLevel: 'Moderate', riskScore: 0.54, conditions: ['HTN'],                 assessedAt: daysAgo(1) },
  { id: 'r-008', patientId: 'PAT-00953', patientName: 'Michael Rodriguez', level: 'Low',      riskLevel: 'Low',      riskScore: 0.32, conditions: ['Hyperthyroidism'],     assessedAt: daysAgo(2) },
];

const CARE_GAPS = [
  { id: 'cg-001', patientId: 'PAT-00142', measureName: 'HbA1c Monitoring (Diabetes)',         status: 'Open', identifiedAt: daysAgo(14) },
  { id: 'cg-002', patientId: 'PAT-00278', measureName: 'Breast Cancer Screening',             status: 'Open', identifiedAt: daysAgo(21) },
  { id: 'cg-003', patientId: 'PAT-00391', measureName: 'Colorectal Cancer Screening',         status: 'Open', identifiedAt: daysAgo(7) },
  { id: 'cg-004', patientId: 'PAT-00554', measureName: 'Annual Wellness Visit',               status: 'Open', identifiedAt: daysAgo(45) },
  { id: 'cg-005', patientId: 'PAT-00619', measureName: 'Blood Pressure Control (HTN)',        status: 'Open', identifiedAt: daysAgo(10) },
  { id: 'cg-006', patientId: 'PAT-00731', measureName: 'Statin Therapy (Cardiovascular)',     status: 'Open', identifiedAt: daysAgo(30) },
  { id: 'cg-007', patientId: 'PAT-00842', measureName: 'Eye Exam (Diabetic Retinopathy)',     status: 'Open', identifiedAt: daysAgo(60) },
  { id: 'cg-008', patientId: 'PAT-00953', measureName: 'Pneumococcal Vaccination (65+)',      status: 'Open', identifiedAt: daysAgo(5) },
];

const DENIALS = [
  { id: 'd-001', claimNumber: 'CLM-20240301', payerName: 'BlueCross BlueShield', denialReasonCode: 'CO-4',  category: 'Coding',            status: 'Open',         denialStatus: 'Open',         deniedAmount: 3200, deniedAmountUsd: 3200, appealDeadline: daysFromNow(6),  daysUntilDeadline: 6  },
  { id: 'd-002', claimNumber: 'CLM-20240285', payerName: 'Aetna',                denialReasonCode: 'PR-96', category: 'Coverage',          status: 'UnderAppeal',  denialStatus: 'UnderAppeal',  deniedAmount: 1850, deniedAmountUsd: 1850, appealDeadline: daysFromNow(3),  daysUntilDeadline: 3  },
  { id: 'd-003', claimNumber: 'CLM-20240241', payerName: 'UnitedHealth',         denialReasonCode: 'CO-11', category: 'Medical Necessity', status: 'Open',         denialStatus: 'Open',         deniedAmount: 7400, deniedAmountUsd: 7400, appealDeadline: daysFromNow(4),  daysUntilDeadline: 4  },
  { id: 'd-004', claimNumber: 'CLM-20240198', payerName: 'Cigna',                denialReasonCode: 'CO-97', category: 'Billing',           status: 'Resubmitted',  denialStatus: 'Resubmitted',  deniedAmount: 920,  deniedAmountUsd: 920,  appealDeadline: daysFromNow(21), daysUntilDeadline: 21 },
  { id: 'd-005', claimNumber: 'CLM-20240177', payerName: 'Humana',               denialReasonCode: 'CO-16', category: 'Authorization',     status: 'Open',         denialStatus: 'Open',         deniedAmount: 4750, deniedAmountUsd: 4750, appealDeadline: daysFromNow(2),  daysUntilDeadline: 2  },
  { id: 'd-006', claimNumber: 'CLM-20240155', payerName: 'Medicare',             denialReasonCode: 'PR-27', category: 'Coding',            status: 'UnderAppeal',  denialStatus: 'UnderAppeal',  deniedAmount: 2100, deniedAmountUsd: 2100, appealDeadline: daysFromNow(8),  daysUntilDeadline: 8  },
];

const DENIAL_ANALYTICS = {
  totalOpen: 31, totalUnderAppeal: 8, totalResolved: 94, overturned: 71,
  overturnRate: 75.5, nearDeadlineCount: 6,
  byCategory: { Coding: 12, Coverage: 9, 'Medical Necessity': 7, Billing: 3 },
};

const CODING_JOBS = [
  { id: 'cj-001', encounterId: 'ENC-4421', patientId: 'PAT-00142', patientName: 'Sarah Mitchell',    suggestedCodes: ['I50.22', 'N18.3'], approvedCodes: [], status: 'Pending',  createdAt: hoursAgo(1) },
  { id: 'cj-002', encounterId: 'ENC-4389', patientId: 'PAT-00278', patientName: 'David Okafor',      suggestedCodes: ['J44.1', 'E11.9'],  approvedCodes: [], status: 'InReview', createdAt: hoursAgo(2), reviewedBy: 'Dr. Kim' },
  { id: 'cj-003', encounterId: 'ENC-4351', patientId: 'PAT-00391', patientName: 'Maria Gonzalez',    suggestedCodes: ['I25.10', 'I10'],   approvedCodes: ['I25.10', 'I10'], status: 'Approved', createdAt: hoursAgo(4), reviewedAt: hoursAgo(1) },
  { id: 'cj-004', encounterId: 'ENC-4320', patientId: 'PAT-00554', patientName: 'James Patel',       suggestedCodes: ['E11.40', 'E66.9'], approvedCodes: [], status: 'Pending',  createdAt: hoursAgo(5) },
  { id: 'cj-005', encounterId: 'ENC-4298', patientId: 'PAT-00619', patientName: 'Linda Nguyen',      suggestedCodes: ['I10', 'E78.5'],    approvedCodes: ['I10', 'E78.5'], status: 'Submitted', createdAt: daysAgo(1) },
];

const PRIOR_AUTHS = [
  { id: 'pa-001', patientId: 'PAT-00142', patientName: 'Sarah Mitchell',    procedure: 'Cardiac MRI',             procedureCode: '75557', status: 'UnderReview', insurancePayer: 'BlueCross', createdAt: daysAgo(3),  submittedAt: daysAgo(2) },
  { id: 'pa-002', patientId: 'PAT-00278', patientName: 'David Okafor',      procedure: 'Pulmonary Function Test',  procedureCode: '94010', status: 'Approved',    insurancePayer: 'Aetna',     createdAt: daysAgo(7),  submittedAt: daysAgo(6), resolvedAt: daysAgo(2) },
  { id: 'pa-003', patientId: 'PAT-00391', patientName: 'Maria Gonzalez',    procedure: 'Coronary Angiography',    procedureCode: '93454', status: 'Draft',       insurancePayer: 'UnitedHealth', createdAt: daysAgo(1) },
  { id: 'pa-004', patientId: 'PAT-00554', patientName: 'James Patel',       procedure: 'Continuous Glucose Monitor', procedureCode: 'A9278', status: 'Denied',   insurancePayer: 'Cigna',     createdAt: daysAgo(10), submittedAt: daysAgo(9), resolvedAt: daysAgo(4), denialReason: 'Not medically necessary per policy 2.3.1.' },
  { id: 'pa-005', patientId: 'PAT-00619', patientName: 'Linda Nguyen',      procedure: 'CPAP Device',             procedureCode: 'E0601', status: 'Submitted',   insurancePayer: 'Humana',    createdAt: daysAgo(2),  submittedAt: daysAgo(1) },
];

const WAITLIST = [
  { id: 'wl-001', patientId: 'PAT-00142', patientName: 'Sarah Mitchell',    practitionerId: 'DR-Smith',   practitionerName: 'Dr. R. Smith',   priority: 1, status: 'Waiting',  enqueuedAt: hoursAgo(3),  preferredDateFrom: daysFromNow(2) },
  { id: 'wl-002', patientId: 'PAT-00278', patientName: 'David Okafor',      practitionerId: 'DR-Patel',   practitionerName: 'Dr. A. Patel',   priority: 2, status: 'Waiting',  enqueuedAt: hoursAgo(5),  preferredDateFrom: daysFromNow(3) },
  { id: 'wl-003', patientId: 'PAT-00391', patientName: 'Maria Gonzalez',    practitionerId: 'DR-Johnson', practitionerName: 'Dr. T. Johnson', priority: 3, status: 'Promoted', enqueuedAt: hoursAgo(8),  promotedToBookingId: 'BK-8821' },
  { id: 'wl-004', patientId: 'PAT-00554', patientName: 'James Patel',       practitionerId: 'DR-Smith',   practitionerName: 'Dr. R. Smith',   priority: 2, status: 'Waiting',  enqueuedAt: hoursAgo(10) },
  { id: 'wl-005', patientId: 'PAT-00619', patientName: 'Linda Nguyen',      practitionerId: 'DR-Nguyen',  practitionerName: 'Dr. L. Nguyen',  priority: 3, status: 'Waiting',  enqueuedAt: daysAgo(1),   preferredDateTo: daysFromNow(5) },
];

const SLOTS: Array<{ id: string; practitionerId: string; practitionerName: string; startTime: string; endTime: string; status: string }> = (() => {
  const today = new Date().toISOString().split('T')[0];
  return [
    { id: 'sl-001', practitionerId: 'DR-Smith',   practitionerName: 'Dr. R. Smith',   startTime: `${today}T08:00:00`, endTime: `${today}T08:30:00`, status: 'Available' },
    { id: 'sl-002', practitionerId: 'DR-Smith',   practitionerName: 'Dr. R. Smith',   startTime: `${today}T09:00:00`, endTime: `${today}T09:30:00`, status: 'Reserved'  },
    { id: 'sl-003', practitionerId: 'DR-Patel',   practitionerName: 'Dr. A. Patel',   startTime: `${today}T10:00:00`, endTime: `${today}T10:30:00`, status: 'Available' },
    { id: 'sl-004', practitionerId: 'DR-Patel',   practitionerName: 'Dr. A. Patel',   startTime: `${today}T11:00:00`, endTime: `${today}T11:30:00`, status: 'Available' },
    { id: 'sl-005', practitionerId: 'DR-Johnson', practitionerName: 'Dr. T. Johnson', startTime: `${today}T13:00:00`, endTime: `${today}T13:30:00`, status: 'Reserved'  },
    { id: 'sl-006', practitionerId: 'DR-Johnson', practitionerName: 'Dr. T. Johnson', startTime: `${today}T14:00:00`, endTime: `${today}T14:30:00`, status: 'Available' },
    { id: 'sl-007', practitionerId: 'DR-Nguyen',  practitionerName: 'Dr. L. Nguyen',  startTime: `${today}T15:00:00`, endTime: `${today}T15:30:00`, status: 'Available' },
    { id: 'sl-008', practitionerId: 'DR-Nguyen',  practitionerName: 'Dr. L. Nguyen',  startTime: `${today}T16:00:00`, endTime: `${today}T16:30:00`, status: 'Reserved'  },
  ];
})();

const APPOINTMENTS = [
  { id: 'apt-001', patientId: 'PAT-00142', practitionerId: 'DR-Smith',   appointmentType: 'Follow-up', status: 'Booked',   startTime: hoursAgo(1), endTime: hoursAgo(0.5),  bookedAt: daysAgo(3) },
  { id: 'apt-002', patientId: 'PAT-00278', practitionerId: 'DR-Patel',   appointmentType: 'New Patient', status: 'Booked', startTime: hoursAgo(2), endTime: hoursAgo(1.5),  bookedAt: daysAgo(2) },
  { id: 'apt-003', patientId: 'PAT-00391', practitionerId: 'DR-Johnson', appointmentType: 'Wellness',    status: 'Arrived', startTime: minutesAgo(30), endTime: minutesAgo(0), bookedAt: daysAgo(7) },
];

const VOICE_SESSIONS = [
  { id: 'vs-001', patientId: 'PAT-00142', patientName: 'Sarah Mitchell',    status: 'Ended',    startedAt: hoursAgo(0.9), endedAt: hoursAgo(0.5),  transcript: 'Patient reported chest tightness since yesterday morning...' },
  { id: 'vs-002', patientId: 'PAT-00278', patientName: 'David Okafor',      status: 'Ended',    startedAt: hoursAgo(2.2), endedAt: hoursAgo(1.9),  transcript: 'COPD exacerbation — shortness of breath at rest...' },
  { id: 'vs-003', patientId: 'PAT-00391', patientName: 'Maria Gonzalez',    status: 'Ended',    startedAt: hoursAgo(3.5), endedAt: hoursAgo(3.2),  transcript: 'Routine medication refill request — lisinopril 10 mg...' },
  { id: 'vs-004', patientId: 'PAT-00554', patientName: 'James Patel',       status: 'Live',     startedAt: minutesAgo(8) },
];

const ESCALATIONS = [
  { id: 'esc-001', workflowId: 'tw-001', sessionId: 'sess-7f3a', patientId: 'PAT-00142', reason: 'STEMI suspected — immediate cardiology required.',    status: 'Open',     escalatedAt: minutesAgo(8) },
  { id: 'esc-002', workflowId: 'tw-004', sessionId: 'sess-9a5f', patientId: 'PAT-00554', reason: 'Anaphylaxis — observation and allergy team consult.', status: 'Claimed',  escalatedAt: minutesAgo(5),  claimedBy: 'Dr. Park' },
  { id: 'esc-003', workflowId: 'tw-002', sessionId: 'sess-2b9c', patientId: 'PAT-00278', reason: 'Troponin elevated — cardiology notification required.', status: 'Resolved', escalatedAt: hoursAgo(1), resolvedAt: minutesAgo(20), clinicalNote: 'Echo ordered, patient stable.' },
];

const BREAK_GLASS = [
  { id: 'bg-001', requestedByUserId: 'USR-411', requestedByName: 'Dr. E. Parker',  targetPatientId: 'PAT-00891', clinicalJustification: 'Emergency — unresponsive patient, identity unknown.',    grantedAt: hoursAgo(0.5), expiresAt: hoursAgo(-1.5), isRevoked: false },
  { id: 'bg-002', requestedByUserId: 'USR-289', requestedByName: 'Dr. M. Chandra', targetPatientId: 'PAT-00142', clinicalJustification: 'Code blue override — cardiac arrest response.',          grantedAt: hoursAgo(2),   expiresAt: hoursAgo(-0.5), isRevoked: false },
  { id: 'bg-003', requestedByUserId: 'USR-174', requestedByName: 'Nurse T. Williams', targetPatientId: 'PAT-00731', clinicalJustification: 'Unconscious trauma patient — MRN lookup required for surgical consent.', grantedAt: hoursAgo(6),   expiresAt: hoursAgo(2),   isRevoked: true  },
];

const AUDIT_SUMMARY = {
  totalEvents: 1247,
  byCategory: { Login: 312, DataAccess: 584, ConfigChange: 89, BreakGlass: 12, ExportReport: 62, AdminAction: 188 },
  topUsers: [
    { userId: 'USR-001', name: 'Dr. R. Smith',   eventCount: 142 },
    { userId: 'USR-002', name: 'Dr. A. Patel',   eventCount: 98  },
    { userId: 'USR-003', name: 'N. Thompson RN',  eventCount: 87  },
  ],
};

const USERS = [
  { id: 'USR-001', name: 'Dr. Robert Smith',    email: 'r.smith@healthq.demo',    role: 'Clinician', status: 'Active',   createdAt: daysAgo(365) },
  { id: 'USR-002', name: 'Dr. Ananya Patel',    email: 'a.patel@healthq.demo',    role: 'Clinician', status: 'Active',   createdAt: daysAgo(300) },
  { id: 'USR-003', name: 'Nancy Thompson',       email: 'n.thompson@healthq.demo', role: 'Nurse',     status: 'Active',   createdAt: daysAgo(250) },
  { id: 'USR-004', name: 'Mark Wilson',          email: 'm.wilson@healthq.demo',   role: 'Admin',     status: 'Active',   createdAt: daysAgo(400) },
  { id: 'USR-005', name: 'Dr. Lisa Johnson',     email: 'l.johnson@healthq.demo',  role: 'Clinician', status: 'Inactive', createdAt: daysAgo(180) },
];

const CAMPAIGNS = [
  { id: 'camp-001', name: 'Diabetes Awareness Q2 2026',       status: 'Active',   targetCount: 312, sentCount: 291, openRate: 0.61, createdAt: daysAgo(14) },
  { id: 'camp-002', name: 'Flu Vaccine Reminder — Spring',    status: 'Draft',    targetCount: 847, sentCount: 0,   openRate: 0,    createdAt: daysAgo(3)  },
  { id: 'camp-003', name: 'Colorectal Screening Outreach',    status: 'Completed', targetCount: 156, sentCount: 156, openRate: 0.48, createdAt: daysAgo(30) },
  { id: 'camp-004', name: 'Hypertension Self-Management Tips', status: 'Active',   targetCount: 523, sentCount: 402, openRate: 0.55, createdAt: daysAgo(7)  },
];

const CONSENT_RECORDS = [
  { id: 'con-001', patientId: 'PAT-00142', category: 'Research',        status: 'Granted', grantedAt: daysAgo(120),  expiresAt: daysFromNow(245) },
  { id: 'con-002', patientId: 'PAT-00278', category: 'Marketing',       status: 'Revoked', grantedAt: daysAgo(200),  revokedAt: daysAgo(10) },
  { id: 'con-003', patientId: 'PAT-00391', category: 'DataSharing',     status: 'Granted', grantedAt: daysAgo(90),   expiresAt: daysFromNow(275) },
  { id: 'con-004', patientId: 'PAT-00554', category: 'Telemedicine',    status: 'Granted', grantedAt: daysAgo(60),   expiresAt: daysFromNow(305) },
];

const PATIENT_PROFILE = {
  id: 'PAT-00142',
  name: 'Sarah Mitchell',
  dateOfBirth: '1968-03-15',
  gender: 'Female',
  mrn: 'MRN-442781',
  email: 's.mitchell@example.com',
  phone: '+1-555-0142',
  address: { line: '47 Oak Street', city: 'Springfield', state: 'IL', zip: '62701' },
  insurancePayer: 'BlueCross BlueShield',
  primaryCare: 'Dr. R. Smith',
};

const NOTIFICATIONS = [
  { id: 'n-001', title: 'High-Risk Alert',          body: 'PAT-00142 risk score exceeded 90.',         category: 'Risk',      read: false, createdAt: minutesAgo(12) },
  { id: 'n-002', title: 'Denial Approaching Deadline', body: 'CLM-20240285 deadline in 3 days.',       category: 'Revenue',   read: false, createdAt: hoursAgo(1)   },
  { id: 'n-003', title: 'New Triage Case',           body: 'Anaphylaxis case requires human review.',   category: 'Triage',    read: false, createdAt: minutesAgo(5)  },
  { id: 'n-004', title: 'Waitlist Promotion',        body: 'PAT-00391 promoted from waitlist.',         category: 'Scheduling', read: true, createdAt: hoursAgo(3)   },
  { id: 'n-005', title: 'Care Gap Identified',       body: 'HbA1c overdue for 3 diabetic patients.',   category: 'Population', read: true, createdAt: daysAgo(1)    },
];

const PRACTITIONER_LIST = [
  { id: 'DR-Smith',   name: 'Dr. Robert Smith',    specialty: 'Cardiology',     npi: '1234567890', status: 'Active',   schedulingEnabled: true  },
  { id: 'DR-Patel',   name: 'Dr. Ananya Patel',    specialty: 'Pulmonology',    npi: '2345678901', status: 'Active',   schedulingEnabled: true  },
  { id: 'DR-Johnson', name: 'Dr. Timothy Johnson', specialty: 'General Surgery', npi: '3456789012', status: 'Active',   schedulingEnabled: false },
  { id: 'DR-Nguyen',  name: 'Dr. Lisa Nguyen',     specialty: 'Endocrinology',   npi: '4567890123', status: 'Active',   schedulingEnabled: true  },
  { id: 'DR-Park',    name: 'Dr. Eunice Park',     specialty: 'Emergency Med',  npi: '5678901234', status: 'On Leave', schedulingEnabled: false },
];

const FHIR_CONDITIONS = {
  resourceType: 'Bundle',
  entry: [
    { resource: { resourceType: 'Condition', id: 'cond-001', code: { coding: [{ display: 'Heart failure, unspecified (I50.9)' }] }, clinicalStatus: { coding: [{ code: 'active' }] }, onsetDateTime: daysAgo(365) } },
    { resource: { resourceType: 'Condition', id: 'cond-002', code: { coding: [{ display: 'Chronic kidney disease, Stage 3 (N18.3)' }] }, clinicalStatus: { coding: [{ code: 'active' }] }, onsetDateTime: daysAgo(730) } },
    { resource: { resourceType: 'Condition', id: 'cond-003', code: { coding: [{ display: 'Type 2 diabetes mellitus (E11.9)' }] }, clinicalStatus: { coding: [{ code: 'active' }] }, onsetDateTime: daysAgo(1460) } },
  ],
};

const FHIR_ALLERGIES = [
  { resourceType: 'AllergyIntolerance', id: 'allergy-001', code: { coding: [{ display: 'Penicillin' }] }, reaction: [{ manifestation: [{ text: 'Rash' }] }], criticality: 'high', recordedDate: daysAgo(200) },
  { resourceType: 'AllergyIntolerance', id: 'allergy-002', code: { coding: [{ display: 'Sulfonamides' }] }, reaction: [{ manifestation: [{ text: 'Urticaria' }] }], criticality: 'moderate', recordedDate: daysAgo(500) },
];

const FHIR_MEDICATIONS = [
  { resourceType: 'MedicationRequest', id: 'med-001', medicationCodeableConcept: { text: 'Furosemide 40 mg oral tablet' }, status: 'active', authoredOn: daysAgo(30),  dosageInstruction: [{ text: 'Take 1 tablet daily in the morning' }] },
  { resourceType: 'MedicationRequest', id: 'med-002', medicationCodeableConcept: { text: 'Lisinopril 10 mg oral tablet' }, status: 'active', authoredOn: daysAgo(90),  dosageInstruction: [{ text: 'Take 1 tablet daily' }] },
  { resourceType: 'MedicationRequest', id: 'med-003', medicationCodeableConcept: { text: 'Atorvastatin 40 mg oral tablet' }, status: 'active', authoredOn: daysAgo(180), dosageInstruction: [{ text: 'Take 1 tablet at bedtime' }] },
];

const FHIR_IMMUNIZATIONS = [
  { resourceType: 'Immunization', id: 'imm-001', vaccineCode: { coding: [{ display: 'COVID-19 mRNA Vaccine (Moderna)' }] }, status: 'completed', occurrenceDateTime: daysAgo(180) },
  { resourceType: 'Immunization', id: 'imm-002', vaccineCode: { coding: [{ display: 'Influenza Vaccine (Quadrivalent)' }] }, status: 'completed', occurrenceDateTime: daysAgo(365) },
  { resourceType: 'Immunization', id: 'imm-003', vaccineCode: { coding: [{ display: 'Pneumococcal Polysaccharide Vaccine (PPSV23)' }] }, status: 'completed', occurrenceDateTime: daysAgo(730) },
];

const FHIR_ENCOUNTERS = {
  resourceType: 'Bundle',
  entry: [
    { resource: { resourceType: 'Encounter', id: 'enc-001', status: 'in-progress', class: { code: 'AMB', display: 'Ambulatory' },     type: [{ text: 'Follow-up' }],    period: { start: hoursAgo(0.5) } } },
    { resource: { resourceType: 'Encounter', id: 'enc-002', status: 'finished',    class: { code: 'AMB', display: 'Ambulatory' },     type: [{ text: 'New Patient' }],  period: { start: daysAgo(7),  end: daysAgo(7) } } },
    { resource: { resourceType: 'Encounter', id: 'enc-003', status: 'finished',    class: { code: 'IMP', display: 'Inpatient' },      type: [{ text: 'Admission' }],    period: { start: daysAgo(30), end: daysAgo(27) } } },
    { resource: { resourceType: 'Encounter', id: 'enc-004', status: 'cancelled',   class: { code: 'VR',  display: 'Virtual' },        type: [{ text: 'Telehealth' }],   period: { start: daysAgo(14) } } },
  ],
};

const FHIR_OBSERVATIONS = {
  resourceType: 'Bundle',
  entry: [
    { resource: { resourceType: 'Observation', id: 'obs-001', code: { coding: [{ display: 'Blood Pressure' }] }, status: 'final', valueString: '142/88 mmHg', effectiveDateTime: hoursAgo(2) } },
    { resource: { resourceType: 'Observation', id: 'obs-002', code: { coding: [{ display: 'HbA1c' }] }, status: 'final', valueQuantity: { value: 7.8, unit: '%' }, effectiveDateTime: daysAgo(14) } },
    { resource: { resourceType: 'Observation', id: 'obs-003', code: { coding: [{ display: 'eGFR' }] }, status: 'final', valueQuantity: { value: 42, unit: 'mL/min' }, effectiveDateTime: daysAgo(14) } },
  ],
};

const FHIR_EVERYTHING = {
  resourceType: 'Bundle',
  entry: [...FHIR_CONDITIONS.entry, ...FHIR_MEDICATIONS.map(m => ({ resource: m })), ...FHIR_ALLERGIES.map(a => ({ resource: a })), ...FHIR_IMMUNIZATIONS.map(i => ({ resource: i }))],
};

const LAB_FLAGS = [
  { id: 'lf-001', patientId: 'PAT-00142', testName: 'Troponin I', value: '0.48 ng/mL', flag: 'High',     referenceRange: '< 0.04 ng/mL', collectedAt: hoursAgo(3), deltaPercentage: +240 },
  { id: 'lf-002', patientId: 'PAT-00142', testName: 'BNP',        value: '890 pg/mL',  flag: 'High',     referenceRange: '< 100 pg/mL',   collectedAt: hoursAgo(3), deltaPercentage: +12 },
  { id: 'lf-003', patientId: 'PAT-00278', testName: 'O2 Saturation', value: '88%',    flag: 'Critical', referenceRange: '≥ 95%',          collectedAt: minutesAgo(45), deltaPercentage: -4 },
  { id: 'lf-004', patientId: 'PAT-00391', testName: 'LDL Cholesterol', value: '142 mg/dL', flag: 'High', referenceRange: '< 100 mg/dL', collectedAt: daysAgo(1),   deltaPercentage: +5 },
];

const SDOH_ASSESSMENTS = [
  { id: 'sdoh-001', patientId: 'PAT-00142', domain: 'Food Insecurity',     score: 3, severity: 'Moderate', screenedAt: daysAgo(7),  interventionId: null },
  { id: 'sdoh-002', patientId: 'PAT-00278', domain: 'Transportation',       score: 4, severity: 'High',     screenedAt: daysAgo(14), interventionId: 'INT-221' },
  { id: 'sdoh-003', patientId: 'PAT-00391', domain: 'Housing Instability',  score: 2, severity: 'Low',      screenedAt: daysAgo(30), interventionId: null },
];

const HEDIS_MEASURES = [
  { id: 'hm-001', measureId: 'HBA1C',  measureName: 'HbA1c Testing (Diabetes)',       met: true,  value: '7.8%', dueDate: daysFromNow(90) },
  { id: 'hm-002', measureId: 'CDC',    measureName: 'Blood Pressure Control',          met: false, value: '142/88', dueDate: daysFromNow(30) },
  { id: 'hm-003', measureId: 'HEDIS-EED', measureName: 'Eye Exam for Diabetics',      met: false, value: null,  dueDate: daysFromNow(-10), overdue: true },
  { id: 'hm-004', measureId: 'ABA',    measureName: 'Annual Body Mass Assessment',    met: true,  value: '28.4 BMI', dueDate: daysFromNow(180) },
];

const COST_PREDICTIONS = [
  { id: 'cp-001', patientId: 'PAT-00142', predictedAnnualCost: 48200, confidenceInterval: [42000, 56000], topDrivers: ['Heart Failure', 'CKD', 'ED Visits'],          predictedAt: daysAgo(3) },
  { id: 'cp-002', patientId: 'PAT-00278', predictedAnnualCost: 36900, confidenceInterval: [31000, 44000], topDrivers: ['COPD Exacerbations', 'Hospitalizations'],     predictedAt: daysAgo(3) },
  { id: 'cp-003', patientId: 'PAT-00391', predictedAnnualCost: 22400, confidenceInterval: [19000, 27000], topDrivers: ['Specialist Visits', 'Medications', 'Imaging'], predictedAt: daysAgo(3) },
];

const RISK_DISTRIBUTION = [
  { level: 'Critical', count: 14, percentage: 3.1 },
  { level: 'High',     count: 89, percentage: 19.7 },
  { level: 'Moderate', count: 186, percentage: 41.2 },
  { level: 'Low',      count: 162, percentage: 35.9 },
];

const RISK_TRAJECTORY = [
  { date: daysAgo(60), critical: 11, high: 82, moderate: 179, low: 168 },
  { date: daysAgo(30), critical: 12, high: 85, moderate: 183, low: 165 },
  { date: daysAgo(0),  critical: 14, high: 89, moderate: 186, low: 162 },
];

const FEEDBACK_LIST = [
  { id: 'fb-001', sessionId: 'sess-7f3a', rating: 4, comment: 'Triage suggestion was accurate and timely.', submittedAt: daysAgo(1) },
  { id: 'fb-002', sessionId: 'sess-2b9c', rating: 5, comment: 'Excellent differential diagnosis support.',  submittedAt: daysAgo(2) },
  { id: 'fb-003', sessionId: 'sess-4e1d', rating: 3, comment: 'Dosing recommendation needed more context.', submittedAt: daysAgo(3) },
  { id: 'fb-004', sessionId: 'sess-9a5f', rating: 5, comment: 'Anaphylaxis protocol was spot-on.',          submittedAt: daysAgo(4) },
];

const FEEDBACK_SUMMARY = { averageRating: 4.2, total: 47, positive: 38, neutral: 7, negative: 2, trend: 'up' };

const ML_CONFIDENCE = [
  { modelId: 'risk-stratifier-v3',  accuracy: 0.934, f1: 0.918, auc: 0.961, evaluatedAt: daysAgo(7)  },
  { modelId: 'coding-suggester-v2', accuracy: 0.891, f1: 0.876, auc: 0.924, evaluatedAt: daysAgo(14) },
  { modelId: 'denial-predictor-v1', accuracy: 0.867, f1: 0.851, auc: 0.903, evaluatedAt: daysAgo(21) },
];

const MODEL_REGISTRY = [
  { id: 'mreg-001', name: 'risk-stratifier-v3',  version: '3.2.1', isActive: true,  status: 'Deployed',  accuracy: 0.934, deployedAt: daysAgo(14) },
  { id: 'mreg-002', name: 'coding-suggester-v2', version: '2.8.0', isActive: true,  status: 'Deployed',  accuracy: 0.891, deployedAt: daysAgo(21) },
  { id: 'mreg-003', name: 'denial-predictor-v1', version: '1.4.2', isActive: false, status: 'Staging',   accuracy: 0.867, deployedAt: null },
  { id: 'mreg-004', name: 'triage-classifier-v4',version: '4.0.0', isActive: true,  status: 'Deployed',  accuracy: 0.952, deployedAt: daysAgo(7)  },
];

const EXPERIMENT_SUMMARY = [
  { id: 'exp-001', name: 'Risk Model A/B Test',      status: 'Running',   startedAt: daysAgo(14), variants: [{ name: 'Control', uplift: 0 }, { name: 'v3.2', uplift: 4.2 }] },
  { id: 'exp-002', name: 'Coding Suggester Accuracy', status: 'Completed', startedAt: daysAgo(30), endedAt: daysAgo(2), winner: 'v2.8', uplift: 2.7 },
];

const MODEL_GOVERNANCE = [
  { id: 'gov-001', modelId: 'risk-stratifier-v3',  policy: 'Explainability Required', status: 'Compliant',     checkedAt: daysAgo(1)  },
  { id: 'gov-002', modelId: 'coding-suggester-v2', policy: 'Bias Audit',              status: 'ReviewNeeded',  checkedAt: daysAgo(7)  },
  { id: 'gov-003', modelId: 'triage-classifier-v4',policy: 'Clinical Validation',     status: 'Compliant',     checkedAt: daysAgo(3)  },
];

const XAI_EXPLANATIONS = [
  { id: 'xai-001', modelId: 'risk-stratifier-v3', patientId: 'PAT-00142', topFeatures: [{ feature: 'Recent ED visits', contribution: 0.42 }, { feature: 'BNP > 500', contribution: 0.31 }, { feature: 'Age > 65', contribution: 0.18 }], explainedAt: hoursAgo(2) },
];

const DELIVERY_ANALYTICS = { totalSent: 3842, delivered: 3761, opened: 2248, clicked: 812, optedOut: 47, bounced: 34, deliveryRate: 97.9, openRate: 59.8 };

const PUSH_SUBSCRIPTIONS = [
  { id: 'ps-001', userId: 'USR-001', endpoint: 'https://fcm.googleapis.com/demo-1', createdAt: daysAgo(30) },
  { id: 'ps-002', userId: 'USR-002', endpoint: 'https://fcm.googleapis.com/demo-2', createdAt: daysAgo(14) },
];

const APPOINTMENT_HISTORY = [
  { id: 'ah-001', patientId: 'PAT-00142', practitionerName: 'Dr. R. Smith',   appointmentType: 'Follow-up', status: 'Completed', startTime: daysAgo(7) },
  { id: 'ah-002', patientId: 'PAT-00142', practitionerName: 'Dr. A. Patel',   appointmentType: 'Cardiology', status: 'Completed', startTime: daysAgo(30) },
  { id: 'ah-003', patientId: 'PAT-00142', practitionerName: 'Dr. L. Nguyen',  appointmentType: 'Endocrinology', status: 'Cancelled', startTime: daysAgo(14) },
];

const PRIOR_AUTH_STATUS = [
  { id: 'pas-001', procedure: 'MRI Brain', status: 'Approved', payer: 'BlueCross', requestedAt: daysAgo(5),  resolvedAt: daysAgo(2) },
  { id: 'pas-002', procedure: 'Colonoscopy', status: 'Pending', payer: 'Aetna',    requestedAt: daysAgo(2) },
];

const CARE_GAP_SUMMARY = { total: 84, critical: 12, dueThisMonth: 31, addressed: 18, complianceRate: 68.4 };

const RISK_TRAJECTORY_PATIENT = {
  patientId: 'PAT-00142',
  dataPoints: [
    { assessedAt: daysAgo(60), riskScore: 0.71, level: 'High',     trend: 'Stable',    scoreDelta: 0.00 },
    { assessedAt: daysAgo(45), riskScore: 0.76, level: 'High',     trend: 'Worsening', scoreDelta: 0.05 },
    { assessedAt: daysAgo(30), riskScore: 0.82, level: 'High',     trend: 'Worsening', scoreDelta: 0.06 },
    { assessedAt: daysAgo(15), riskScore: 0.88, level: 'Critical', trend: 'Worsening', scoreDelta: 0.06 },
    { assessedAt: daysAgo(7),  riskScore: 0.91, level: 'Critical', trend: 'Worsening', scoreDelta: 0.03 },
    { assessedAt: daysAgo(2),  riskScore: 0.94, level: 'Critical', trend: 'Worsening', scoreDelta: 0.03 },
  ],
  min: 0.71,
  max: 0.94,
  mean: 0.84,
  slope: 0.0038,
  overallTrend: 'Worsening',
};

const DRUG_INTERACTION_RESULT = { interactions: [
  { drug1: 'Warfarin', drug2: 'Aspirin', severity: 'Major', description: 'Increased bleeding risk. Monitor INR closely.', recommendation: 'Consider alternative antiplatelet therapy.' },
], checkedAt: new Date().toISOString() };

const TENANT_ADMIN = { id: 'tenant-001', name: 'HealthQ Demo Org', plan: 'Enterprise', activeUsers: 42, storageUsedGB: 12.4, dataRegion: 'US-East', mfaEnabled: true, createdAt: daysAgo(730) };

const DEMO_SESSIONS = [
  { id: 'demo-001', name: 'Dr. E. Parker',  company: 'Metro General Hospital', sessionId: 'sess-demo-001', startedAt: daysAgo(1), completedAt: daysAgo(1), feedback: 4 },
  { id: 'demo-002', name: 'M. Chang',       company: 'Pacific Health System',  sessionId: 'sess-demo-002', startedAt: daysAgo(3), completedAt: daysAgo(3), feedback: 5 },
  { id: 'demo-003', name: 'Dr. R. Torres',  company: 'Lakeside Medical Group', sessionId: 'sess-demo-003', startedAt: daysAgo(5), completedAt: null,       feedback: null },
];

const GUIDE_HISTORY = [
  { id: 'gh-001', guideId: 'guide-triage',     title: 'Triage Workflow Guide',     completedAt: daysAgo(2),  durationSeconds: 342 },
  { id: 'gh-002', guideId: 'guide-scheduling', title: 'Scheduling Overview',        completedAt: daysAgo(7),  durationSeconds: 218 },
  { id: 'gh-003', guideId: 'guide-revenue',    title: 'Revenue Cycle Essentials',  completedAt: daysAgo(14), durationSeconds: 465 },
];

const PLATFORM_HEALTH = [
  { service: 'API Gateway',          status: 'Healthy',   latencyMs: 42,  uptimePct: 99.97 },
  { service: 'Identity Service',     status: 'Healthy',   latencyMs: 68,  uptimePct: 99.92 },
  { service: 'Triage AI Engine',     status: 'Healthy',   latencyMs: 124, uptimePct: 99.85 },
  { service: 'FHIR Repository',      status: 'Degraded',  latencyMs: 890, uptimePct: 98.71 },
  { service: 'Notification Service', status: 'Healthy',   latencyMs: 55,  uptimePct: 99.99 },
  { service: 'Revenue Microservice', status: 'Healthy',   latencyMs: 78,  uptimePct: 99.94 },
  { service: 'SignalR Hub',          status: 'Healthy',   latencyMs: 31,  uptimePct: 99.98 },
];

const BUSINESS_KPI_DATA = {
  tenants: [{ id: 'tenant-001', name: 'HealthQ Demo Org', plan: 'Enterprise', status: 'Active' }],
  users:   USERS,
  feedback: { ...FEEDBACK_SUMMARY, items: FEEDBACK_LIST },
  denials:  DENIAL_ANALYTICS,
  delivery: DELIVERY_ANALYTICS,
  demoSessions: DEMO_SESSIONS,
  models:       MODEL_REGISTRY,
  campaigns:    CAMPAIGNS,
};

const PATIENT_SEARCH_RESULTS = [
  { id: 'PAT-00142', name: 'Sarah Mitchell',    dob: '1968-03-15', mrn: 'MRN-442781', riskLevel: 'Critical', openCareGaps: 2 },
  { id: 'PAT-00278', name: 'David Okafor',      dob: '1955-07-22', mrn: 'MRN-331209', riskLevel: 'Critical', openCareGaps: 1 },
  { id: 'PAT-00391', name: 'Maria Gonzalez',    dob: '1962-11-08', mrn: 'MRN-227845', riskLevel: 'High',     openCareGaps: 3 },
  { id: 'PAT-00554', name: 'James Patel',       dob: '1975-04-30', mrn: 'MRN-119473', riskLevel: 'High',     openCareGaps: 1 },
  { id: 'PAT-00619', name: 'Linda Nguyen',      dob: '1948-09-14', mrn: 'MRN-885612', riskLevel: 'High',     openCareGaps: 2 },
  { id: 'PAT-00731', name: 'Robert Chen',       dob: '1980-02-28', mrn: 'MRN-774391', riskLevel: 'Moderate', openCareGaps: 0 },
  { id: 'PAT-00842', name: 'Angela Thompson',   dob: '1990-06-17', mrn: 'MRN-663122', riskLevel: 'Moderate', openCareGaps: 1 },
  { id: 'PAT-00953', name: 'Michael Rodriguez', dob: '2001-12-05', mrn: 'MRN-551847', riskLevel: 'Low',      openCareGaps: 0 },
];

// ── Route matcher ─────────────────────────────────────────────────────────────

function matchResponse(url: string, method: string): Promise<Response> | null {
  // Strip query string for matching
  const path = url.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '');

  // ── POST / PUT / DELETE — optimistic 200 ──────────────────────────────────
  if (method !== 'GET') {
    // Special case: appeals return updated denial
    if (/\/revenue\/denials\/.+\/appeal/.test(path))
      return ok({ success: true, message: 'Appeal submitted successfully.' });
    if (/\/scheduling\/waitlist\/conflict-check/.test(path))
      return ok({ hasConflict: false, conflicts: [] });
    if (/\/voice\/sessions$/.test(path))
      return ok({ id: `vs-${Date.now()}`, status: 'Live', startedAt: new Date().toISOString() });
    if (/\/identity\/otp\/send/.test(path))
      return ok({ sent: true, maskedPhone: '+1-555-****' });
    if (/\/identity\/otp\/verify/.test(path))
      return ok({ verified: true, token: 'demo-jwt-token' });
    if (/\/identity\/consent\/erasure/.test(path))
      return ok({ erasureScheduled: true, scheduledAt: new Date().toISOString() });
    if (/\/ocr\/jobs$/.test(path))
      return ok({ id: `ocr-${Date.now()}`, status: 'Queued' });
    if (/\/ocr\/jobs\/.+\/process/.test(path))
      return ok({ status: 'Processing', estimatedSeconds: 8 });
    // Generic mutation success
    return ok({ success: true });
  }

  // ── GET routes ─────────────────────────────────────────────────────────────

  // Dashboard & agent stats
  if (path === '/api/v1/agents/stats')                       return ok(AGENT_STATS);
  if (path === '/api/v1/agents/triage')                      return ok(TRIAGE_WORKFLOWS);
  if (path === '/api/v1/agents/escalations')                 return ok(ESCALATIONS);
  if (path === '/api/v1/agents/feedback')                    return ok(FEEDBACK_LIST);
  if (/\/agents\/demo\/sessions/.test(path))                 return ok(DEMO_SESSIONS);
  if (/\/agents\/demo\/insights/.test(path))                 return ok({ insights: ['High overturn rate on Coding denials.', 'FHIR data completeness at 94%.' ]});

  // Scheduling
  if (path === '/api/v1/scheduling/stats')                   return ok(SCHEDULING_STATS);
  if (/\/scheduling\/waitlist\/conflict-check/.test(path))   return ok({ hasConflict: false, conflicts: [] });
  if (/\/scheduling\/waitlist/.test(path))                   return ok(WAITLIST);
  if (/\/scheduling\/slots/.test(path))                      return ok(SLOTS);
  if (/\/scheduling\/bookings/.test(path))                   return ok([]);
  if (/\/scheduling\/appointments/.test(path))               return ok(APPOINTMENTS);

  // Population health
  if (path === '/api/v1/population-health/stats')            return ok(POP_HEALTH_STATS);
  if (/\/population-health\/risks\/.+\/trajectory/.test(path)) return ok(RISK_TRAJECTORY_PATIENT);
  if (/\/population-health\/risks/.test(path))               return ok(RISK_PATIENTS);
  if (/\/population-health\/care-gaps/.test(path))           return ok(CARE_GAPS);
  if (/\/population-health\/cost-prediction/.test(path))     return ok(COST_PREDICTIONS);
  if (/\/population-health\/risk-distribution/.test(path))   return ok(RISK_DISTRIBUTION);
  if (/\/population-health\/risk-trajectory/.test(path))     return ok(RISK_TRAJECTORY);
  if (/\/population-health\/sdoh/.test(path))                return ok(SDOH_ASSESSMENTS);
  if (/\/population-health\/drug-interactions/.test(path))   return ok(DRUG_INTERACTION_RESULT);
  if (/\/population-health\/patients\/.+\/hedis/.test(path)) return ok(HEDIS_MEASURES);

  // Revenue
  if (path === '/api/v1/revenue/stats')                      return ok(REVENUE_STATS);
  if (/\/revenue\/denials/.test(path))                       return ok(DENIALS);
  if (/\/revenue\/coding-jobs/.test(path))                   return ok(CODING_JOBS);
  if (/\/revenue\/prior-auths/.test(path))                   return ok(PRIOR_AUTHS);

  // Voice
  if (/\/voice\/sessions/.test(path))                        return ok(VOICE_SESSIONS);

  // FHIR
  if (/\/fhir\/conditions/.test(path))                       return ok(FHIR_CONDITIONS);
  if (/\/fhir\/allergies/.test(path))                        return ok(FHIR_ALLERGIES);
  if (/\/fhir\/medications/.test(path))                      return ok(FHIR_MEDICATIONS);
  if (/\/fhir\/immunizations/.test(path))                    return ok(FHIR_IMMUNIZATIONS);
  if (/\/fhir\/encounters/.test(path))                       return ok(FHIR_ENCOUNTERS);
  if (/\/fhir\/observations/.test(path))                     return ok(FHIR_OBSERVATIONS);
  if (/\/fhir\/everything/.test(path))                       return ok(FHIR_EVERYTHING);

  // Identity
  if (/\/identity\/patients\/me/.test(path))                 return ok(PATIENT_PROFILE);
  if (/\/identity\/patients\/register/.test(path))           return ok({ id: 'PAT-NEW', status: 'Registered' });
  if (/\/identity\/users/.test(path))                        return ok(USERS);
  if (/\/identity\/consent$/.test(path))                     return ok(CONSENT_RECORDS);
  if (/\/identity\/break-glass/.test(path))                  return ok(BREAK_GLASS);

  // Notifications
  if (/\/notifications\/campaigns/.test(path))               return ok(CAMPAIGNS);
  if (/\/notifications\/push-subscriptions/.test(path))      return ok(PUSH_SUBSCRIPTIONS);
  if (/\/notifications/.test(path))                          return ok(NOTIFICATIONS);

  // Admin
  if (/\/admin\/audit\/summary/.test(path))                  return ok(AUDIT_SUMMARY);
  if (/\/admin\/audit\/export/.test(path))                   return ok({ downloadUrl: '#demo-export' });

  // Practitioners
  if (/\/practitioners/.test(path))                          return ok(PRACTITIONER_LIST);

  // ML / AI Ops
  if (/\/ml\/confidence/.test(path))                         return ok(ML_CONFIDENCE);
  if (/\/models\/registry/.test(path))                       return ok(MODEL_REGISTRY);
  if (/\/experiments/.test(path))                            return ok(EXPERIMENT_SUMMARY);
  if (/\/governance/.test(path))                             return ok(MODEL_GOVERNANCE);
  if (/\/xai\/explanations/.test(path))                      return ok(XAI_EXPLANATIONS);

  // OCR
  if (/\/ocr\/jobs/.test(path))                              return ok([]);

  // Patient search (pophealth-mfe)
  if (/\/population-health\/patients\b(?!.*hedis)/.test(path)) return ok(PATIENT_SEARCH_RESULTS);

  // SDOH / Engagement
  if (/\/engagement\/appointment-history/.test(path))        return ok(APPOINTMENT_HISTORY);
  if (/\/engagement\/prior-auth-status/.test(path))          return ok(PRIOR_AUTH_STATUS);
  if (/\/engagement\/care-gap-summary/.test(path))           return ok(CARE_GAP_SUMMARY);

  // Platform health probes — each service responds 200 OK (demo = all healthy)
  if (/\/health$/.test(path))                                return ok({ status: 'Healthy' });

  // Miscellaneous
  if (/\/tenant/.test(path))                                 return ok(TENANT_ADMIN);
  if (/\/platform\/health/.test(path))                       return ok(PLATFORM_HEALTH);
  if (/\/kpi/.test(path))                                    return ok(BUSINESS_KPI_DATA);
  if (/\/feedback\/summary/.test(path))                      return ok(FEEDBACK_SUMMARY);
  if (/\/delivery\/analytics/.test(path))                    return ok(DELIVERY_ANALYTICS);
  if (/\/guide\/history/.test(path))                         return ok(GUIDE_HISTORY);

  // No demo match — let the real request through
  return null;
}

// ── Interceptor installation ──────────────────────────────────────────────────

let installed = false;

export function installDemoFetchInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url    = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();

    // Only intercept our API calls
    if (url.includes('/api/v1/') || url.includes('/api/v2/')) {
      const mock = matchResponse(url, method);
      if (mock) return mock;
    }

    // Pass all other requests (static assets, SignalR negotiate, etc.) through
    return originalFetch(input, init);
  };

  // eslint-disable-next-line no-console
  console.info('[HealthQ] Demo mode active — API calls are intercepted with realistic sample data.');
}
