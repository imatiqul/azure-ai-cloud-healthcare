/**
 * @healthcare/mfe-events
 *
 * Typed cross-MFE event bus built on the browser's native CustomEvent API.
 * All inter-MFE communication goes through `window` so no shared runtime
 * state is needed — each MFE simply imports and calls these helpers.
 *
 * Usage (emit):
 *   import { emitTranscriptCompleted } from '@healthcare/mfe-events';
 *   emitTranscriptCompleted({ sessionId: '…', transcriptText: '…', triageLevel: 'P1_Immediate' });
 *
 * Usage (listen):
 *   import { onTranscriptCompleted } from '@healthcare/mfe-events';
 *   const off = onTranscriptCompleted(({ detail }) => console.log(detail.triageLevel));
 *   // …later
 *   off();
 */

// ── Event payload types ──────────────────────────────────────────────────────

export interface TranscriptCompletedDetail {
  sessionId: string;
  transcriptText: string;
  triageLevel?: string;
}

export interface AgentDecisionDetail {
  sessionId: string;
  triageLevel: string;
  reasoning: string;
  isGuardApproved?: boolean;
}

export interface EscalationRequiredDetail {
  sessionId: string;
  workflowId?: string;
  reason?: string;
}

export interface PatientSelectedDetail {
  patientId: string;
  riskLevel?: string;
}

export interface SlotReservedDetail {
  slotId: string;
  patientId?: string;
  practitionerId?: string;
}

export interface BookingCreatedDetail {
  bookingId?: string;
  slotId: string;
  patientId: string;
}

export interface TriageApprovedDetail {
  workflowId: string;
  sessionId: string;
  patientId?: string;
  triageLevel: string;
  approvedBy: string; // userId of the clinician who approved
}

export interface NavigationRequestedDetail {
  /** Target route path e.g. '/triage', '/scheduling?patientId=123' */
  path: string;
  /** Optional human-readable reason for the navigation (used by AI Copilot) */
  reason?: string;
  /** When true, open in a new browser tab */
  openInNewTab?: boolean;
}

export interface TabSelectionRequestedDetail {
  /** Session-storage key used by the shell tab layout */
  storageKey: string;
  /** Zero-based tab index to activate */
  tabIndex: number;
}

export interface BackendStatusChangedDetail {
  /** true = APIM/backend is reachable, false = down/not deployed, null = checking */
  online: boolean;
}

export type WorkflowHandoffStatus = 'Processing' | 'AwaitingHumanReview' | 'Completed' | 'Scheduling' | 'Booked';

export interface WorkflowHandoffRecord {
  workflowId: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  transcriptText?: string;
  triageLevel?: string;
  reasoning?: string;
  confidenceScore?: number;
  status: WorkflowHandoffStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  practitionerId?: string;
  slotId?: string;
}

export const WORKFLOW_HANDOFFS_STORAGE_KEY = 'hq:workflow-handoffs';
export const ACTIVE_WORKFLOW_ID_STORAGE_KEY = 'hq:active-workflow-id';

// ── Event name constants ─────────────────────────────────────────────────────

export const MFE_EVENTS = {
  TRANSCRIPT_COMPLETED:    'mfe:transcript:completed',
  AGENT_DECISION:          'mfe:agent:decision',
  ESCALATION_REQUIRED:     'mfe:escalation:required',
  PATIENT_SELECTED:        'mfe:patient:selected',
  SLOT_RESERVED:           'mfe:slot:reserved',
  BOOKING_CREATED:         'mfe:booking:created',
  TRIAGE_APPROVED:         'mfe:triage:approved',
  NAVIGATION_REQUESTED:    'mfe:navigation:requested',
  TAB_SELECTION_REQUESTED: 'mfe:tab:selection',
  BACKEND_STATUS_CHANGED:  'mfe:backend:status',
} as const;

export type MfeEventName = (typeof MFE_EVENTS)[keyof typeof MFE_EVENTS];

// ── Generic helpers ──────────────────────────────────────────────────────────

export function emitMfeEvent<T>(name: MfeEventName, detail: T): void {
  window.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: false }));
}

type MfeEventHandler<T> = (event: CustomEvent<T>) => void;

export function onMfeEvent<T>(
  name: MfeEventName,
  handler: MfeEventHandler<T>,
): () => void {
  const listener = handler as EventListener;
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

// ── Typed convenience emitters ───────────────────────────────────────────────

export const emitTranscriptCompleted = (detail: TranscriptCompletedDetail) =>
  emitMfeEvent<TranscriptCompletedDetail>(MFE_EVENTS.TRANSCRIPT_COMPLETED, detail);

export const emitAgentDecision = (detail: AgentDecisionDetail) =>
  emitMfeEvent<AgentDecisionDetail>(MFE_EVENTS.AGENT_DECISION, detail);

export const emitEscalationRequired = (detail: EscalationRequiredDetail) =>
  emitMfeEvent<EscalationRequiredDetail>(MFE_EVENTS.ESCALATION_REQUIRED, detail);

export const emitPatientSelected = (detail: PatientSelectedDetail) =>
  emitMfeEvent<PatientSelectedDetail>(MFE_EVENTS.PATIENT_SELECTED, detail);

// ── Typed convenience listeners ──────────────────────────────────────────────

export const onTranscriptCompleted = (handler: MfeEventHandler<TranscriptCompletedDetail>) =>
  onMfeEvent<TranscriptCompletedDetail>(MFE_EVENTS.TRANSCRIPT_COMPLETED, handler);

export const onAgentDecision = (handler: MfeEventHandler<AgentDecisionDetail>) =>
  onMfeEvent<AgentDecisionDetail>(MFE_EVENTS.AGENT_DECISION, handler);

export const onEscalationRequired = (handler: MfeEventHandler<EscalationRequiredDetail>) =>
  onMfeEvent<EscalationRequiredDetail>(MFE_EVENTS.ESCALATION_REQUIRED, handler);

export const onPatientSelected = (handler: MfeEventHandler<PatientSelectedDetail>) =>
  onMfeEvent<PatientSelectedDetail>(MFE_EVENTS.PATIENT_SELECTED, handler);

export const emitSlotReserved = (detail: SlotReservedDetail) =>
  emitMfeEvent<SlotReservedDetail>(MFE_EVENTS.SLOT_RESERVED, detail);

export const emitBookingCreated = (detail: BookingCreatedDetail) =>
  emitMfeEvent<BookingCreatedDetail>(MFE_EVENTS.BOOKING_CREATED, detail);

export const onSlotReserved = (handler: MfeEventHandler<SlotReservedDetail>) =>
  onMfeEvent<SlotReservedDetail>(MFE_EVENTS.SLOT_RESERVED, handler);

export const onBookingCreated = (handler: MfeEventHandler<BookingCreatedDetail>) =>
  onMfeEvent<BookingCreatedDetail>(MFE_EVENTS.BOOKING_CREATED, handler);

export const emitTriageApproved = (detail: TriageApprovedDetail) =>
  emitMfeEvent<TriageApprovedDetail>(MFE_EVENTS.TRIAGE_APPROVED, detail);

export const onTriageApproved = (handler: MfeEventHandler<TriageApprovedDetail>) =>
  onMfeEvent<TriageApprovedDetail>(MFE_EVENTS.TRIAGE_APPROVED, handler);

export const emitNavigationRequested = (detail: NavigationRequestedDetail) =>
  emitMfeEvent<NavigationRequestedDetail>(MFE_EVENTS.NAVIGATION_REQUESTED, detail);

export const onNavigationRequested = (handler: MfeEventHandler<NavigationRequestedDetail>) =>
  onMfeEvent<NavigationRequestedDetail>(MFE_EVENTS.NAVIGATION_REQUESTED, handler);

export const emitTabSelectionRequested = (detail: TabSelectionRequestedDetail) =>
  emitMfeEvent<TabSelectionRequestedDetail>(MFE_EVENTS.TAB_SELECTION_REQUESTED, detail);

export const onTabSelectionRequested = (handler: MfeEventHandler<TabSelectionRequestedDetail>) =>
  onMfeEvent<TabSelectionRequestedDetail>(MFE_EVENTS.TAB_SELECTION_REQUESTED, handler);

export const emitBackendStatusChanged = (detail: BackendStatusChangedDetail) =>
  window.dispatchEvent(new CustomEvent<BackendStatusChangedDetail>(MFE_EVENTS.BACKEND_STATUS_CHANGED, { detail, bubbles: false }));

export const onBackendStatusChanged = (handler: MfeEventHandler<BackendStatusChangedDetail>) => {
  const listener = handler as EventListener;
  window.addEventListener(MFE_EVENTS.BACKEND_STATUS_CHANGED, listener);
  return () => window.removeEventListener(MFE_EVENTS.BACKEND_STATUS_CHANGED, listener);
};

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function saveActiveWorkflowId(identifier: string | null): void {
  if (!canUseSessionStorage()) return;

  try {
    if (!identifier) {
      window.sessionStorage.removeItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY, identifier);
    }
  } catch {
    // Ignore storage failures for the active workflow pointer.
  }
}

function isWorkflowHandoffRecord(value: unknown): value is WorkflowHandoffRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return typeof record.workflowId === 'string'
    && typeof record.sessionId === 'string'
    && typeof record.status === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

function saveWorkflowHandoffs(records: WorkflowHandoffRecord[]): WorkflowHandoffRecord[] {
  const normalized = [...records]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 25);

  if (!canUseSessionStorage()) return normalized;

  try {
    window.sessionStorage.setItem(WORKFLOW_HANDOFFS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore quota or serialization failures and keep the in-memory result.
  }

  return normalized;
}

export function loadWorkflowHandoffs(): WorkflowHandoffRecord[] {
  if (!canUseSessionStorage()) return [];

  try {
    const raw = window.sessionStorage.getItem(WORKFLOW_HANDOFFS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isWorkflowHandoffRecord)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  } catch {
    return [];
  }
}

export function getWorkflowHandoff(identifier: string): WorkflowHandoffRecord | null {
  if (!identifier.trim()) return null;

  return loadWorkflowHandoffs().find((record) =>
    record.workflowId === identifier
    || record.sessionId === identifier,
  ) ?? null;
}

export function getLatestWorkflowHandoff(): WorkflowHandoffRecord | null {
  return loadWorkflowHandoffs()[0] ?? null;
}

export function getActiveWorkflowId(): string | null {
  if (!canUseSessionStorage()) return null;

  try {
    return window.sessionStorage.getItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getActiveWorkflowHandoff(): WorkflowHandoffRecord | null {
  const identifier = getActiveWorkflowId();
  if (!identifier) return null;
  return getWorkflowHandoff(identifier);
}

export function setActiveWorkflow(identifier: string | null): WorkflowHandoffRecord | null {
  if (!identifier?.trim()) {
    saveActiveWorkflowId(null);
    return null;
  }

  const record = getWorkflowHandoff(identifier.trim());
  saveActiveWorkflowId(record?.workflowId ?? identifier.trim());
  return record ?? null;
}

export function upsertWorkflowHandoff(record: WorkflowHandoffRecord): WorkflowHandoffRecord {
  const existing = loadWorkflowHandoffs();
  const index = existing.findIndex((candidate) =>
    candidate.workflowId === record.workflowId
    || candidate.sessionId === record.sessionId
    || candidate.workflowId === record.sessionId
    || candidate.sessionId === record.workflowId,
  );

  const merged: WorkflowHandoffRecord = index >= 0
    ? {
        ...existing[index],
        ...record,
        workflowId: record.workflowId || existing[index].workflowId,
        sessionId: record.sessionId || existing[index].sessionId,
        createdAt: existing[index].createdAt || record.createdAt,
      }
    : record;

  const next = [...existing];
  if (index >= 0) {
    next[index] = merged;
  } else {
    next.push(merged);
  }

  saveWorkflowHandoffs(next);

  const activeIdentifier = getActiveWorkflowId();
  if (!activeIdentifier && next.length === 1) {
    saveActiveWorkflowId(merged.workflowId);
  } else if (
    activeIdentifier
    && index >= 0
    && (
      activeIdentifier === existing[index].workflowId
      || activeIdentifier === existing[index].sessionId
      || activeIdentifier === record.workflowId
      || activeIdentifier === record.sessionId
    )
  ) {
    saveActiveWorkflowId(merged.workflowId);
  }

  return merged;
}

export function selectShellTab(storageKey: string, tabIndex: number): void {
  if (canUseSessionStorage()) {
    try {
      window.sessionStorage.setItem(storageKey, String(tabIndex));
    } catch {
      // Ignore quota failures and still emit the runtime event.
    }
  }

  emitTabSelectionRequested({ storageKey, tabIndex });
}
