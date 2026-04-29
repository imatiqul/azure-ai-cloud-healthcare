const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface WorkflowIdentity {
  workflowId: string;
  patientId?: string;
  patientName?: string;
}

async function postWorkflowTransition(
  path: string,
  payload: Record<string, unknown>,
  authFetch: AuthFetch,
): Promise<void> {
  try {
    await authFetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // The scheduling flow must continue even when the workflow backend is unavailable.
  }
}

export async function syncWorkflowReserve(
  workflow: WorkflowIdentity,
  payload: { slotId: string; patientId?: string; patientName?: string; practitionerId?: string },
  authFetch: AuthFetch,
): Promise<void> {
  await postWorkflowTransition(`/api/v1/agents/workflows/${workflow.workflowId}/reserve`, {
    slotId: payload.slotId,
    patientId: payload.patientId ?? workflow.patientId,
    patientName: payload.patientName ?? workflow.patientName,
    practitionerId: payload.practitionerId,
  }, authFetch);
}

export async function syncWorkflowBooked(
  workflow: WorkflowIdentity,
  payload: { slotId: string; patientId: string; patientName?: string; practitionerId?: string; bookingId?: string },
  authFetch: AuthFetch,
): Promise<void> {
  await postWorkflowTransition(`/api/v1/agents/workflows/${workflow.workflowId}/book`, {
    slotId: payload.slotId,
    patientId: payload.patientId,
    patientName: payload.patientName ?? workflow.patientName,
    practitionerId: payload.practitionerId,
    bookingId: payload.bookingId,
  }, authFetch);
}

export async function syncWorkflowWaitlist(
  workflow: WorkflowIdentity,
  payload: { patientId: string; patientName?: string; practitionerId?: string; priority?: number },
  authFetch: AuthFetch,
): Promise<void> {
  await postWorkflowTransition(`/api/v1/agents/workflows/${workflow.workflowId}/waitlist`, {
    patientId: payload.patientId,
    patientName: payload.patientName ?? workflow.patientName,
    practitionerId: payload.practitionerId,
    priority: payload.priority,
  }, authFetch);
}