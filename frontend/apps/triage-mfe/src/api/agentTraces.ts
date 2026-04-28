/**
 * W4.4 / W5.1 — agent trace API client.
 * Matches the C# `AgentTraceDto` shape on the server
 * (`src/HealthQCopilot.Domain/Agents/Contracts/AgentTraceDto.cs`).
 */
export interface RagCitation {
  sourceId: string;
  title: string;
  url?: string;
  score: number;
  snippet?: string;
}

export interface TokenUsageRecord {
  sessionId: string;
  tenantId: string;
  agentName: string;
  modelId: string;
  deploymentName: string;
  promptId?: string;
  promptVersion?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  capturedAt: string;
}

export interface AgentTraceStep {
  stepId: string;
  parentStepId: string | null;
  agentName: string;
  kind: 'plan' | 'tool_call' | 'rag_lookup' | 'llm_call' | 'guard' | 'handoff' | 'redaction';
  startedAt: string;
  completedAt?: string;
  input?: string;
  output?: string;
  citations: RagCitation[];
  tokens?: TokenUsageRecord | null;
  promptId?: string;
  promptVersion?: string;
  modelId?: string;
  verdict?: 'ok' | 'hallucination' | 'hipaa_violation' | 'low_confidence' | string;
  confidence?: number;
}

export interface AgentTraceTotals {
  llmCalls: number;
  toolCalls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  wallClockSeconds: number;
}

export interface AgentTraceDto {
  sessionId: string;
  tenantId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'budget_exhausted' | string;
  steps: AgentTraceStep[];
  totals: AgentTraceTotals;
}

const apiBase = (import.meta as unknown as { env?: { VITE_AGENT_API?: string } }).env?.VITE_AGENT_API
  ?? '/api/v1/agents';

export async function fetchAgentTrace(sessionId: string, signal?: AbortSignal): Promise<AgentTraceDto | null> {
  const res = await fetch(`${apiBase}/traces/${encodeURIComponent(sessionId)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load agent trace: ${res.status}`);
  return res.json() as Promise<AgentTraceDto>;
}

export async function postClinicianFeedback(payload: {
  sessionId: string;
  rating: number;
  correction?: string;
  clinicianId?: string;
}): Promise<void> {
  const res = await fetch(`${apiBase}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Failed to submit feedback: ${res.status}`);
  }
}

export async function cancelAgentSession(sessionId: string): Promise<void> {
  const res = await fetch(`${apiBase}/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Failed to cancel session: ${res.status}`);
  }
}
