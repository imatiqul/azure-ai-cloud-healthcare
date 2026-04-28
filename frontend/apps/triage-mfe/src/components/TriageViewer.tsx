import { useState, useEffect, useRef } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, useStreamText } from '@healthcare/design-system';
import {
  emitNavigationRequested,
  getActiveWorkflowHandoff,
  getWorkflowHandoff,
  loadWorkflowHandoffs,
  onAgentDecision,
  onBackendStatusChanged,
  onEscalationRequired,
  onTranscriptCompleted,
  onTriageApproved,
  setActiveWorkflow,
  selectShellTab,
  type WorkflowHandoffRecord,
  upsertWorkflowHandoff,
} from '@healthcare/mfe-events';
import { HitlEscalationModal } from './HitlEscalationModal';
import { AgentTraceViewer, useLiveToolEvents } from './AgentTrace';

const AGENT_TRACE_ENABLED = import.meta.env.VITE_AGENT_TRACE_ENABLED === 'true';

/**
 * Streams the agentReasoning text word-by-word on first mount.
 * Because each card has a stable key={wf.id}, this component mounts once per
 * workflow and does not re-stream on subsequent 5-second polling re-renders.
 */
function StreamingReasoningText({ text }: { text: string }) {
  const { displayed, streaming } = useStreamText(text, 22);
  return (
    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
      AI: {displayed}
      {streaming && (
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            width: '1px',
            height: '0.85em',
            bgcolor: 'primary.main',
            ml: '1px',
            verticalAlign: 'text-bottom',
            animation: 'blink 1s step-end infinite',
            '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
          }}
        />
      )}
    </Typography>
  );
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_WORKFLOWS: TriageWorkflow[] = [
  {
    id: 'demo-wf-1',
    sessionId: 'a1b2c3d4-0000-0000-0000-000000000001',
    patientName: 'James Chen',
    status: 'AwaitingHumanReview',
    triageLevel: 'P1_Immediate',
    confidenceScore: 96,
    agentReasoning: 'Patient reports severe chest pain radiating to left arm with shortness of breath. Vitals: BP 160/100, HR 112. Immediate cardiac evaluation required.',
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-wf-2',
    sessionId: 'a1b2c3d4-0000-0000-0000-000000000002',
    patientName: 'Alice Morgan',
    status: 'AwaitingHumanReview',
    triageLevel: 'P2_Urgent',
    confidenceScore: 88,
    agentReasoning: 'Patient presents with persistent high fever (39.8°C), severe headache, and photophobia for 18 hours. Meningitis screening recommended.',
    createdAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-wf-3',
    sessionId: 'a1b2c3d4-0000-0000-0000-000000000003',
    patientName: 'Sarah O\'Brien',
    status: 'Completed',
    triageLevel: 'P3_Standard',
    confidenceScore: 79,
    agentReasoning: 'Patient reports moderate lower back pain (6/10) for 3 days following heavy lifting. No neurological symptoms. Recommend physiotherapy referral.',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-wf-4',
    sessionId: 'a1b2c3d4-0000-0000-0000-000000000004',
    patientName: 'Robert Wilson',
    status: 'Processing',
    triageLevel: 'P2_Urgent',
    confidenceScore: 91,
    agentReasoning: 'Evaluating patient with sudden onset of right-sided weakness and slurred speech. Stroke protocol being assessed.',
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  },
];

interface TriageWorkflow {
  id: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  status: string;
  triageLevel: string;
  confidenceScore?: number; // 0-100
  agentReasoning?: string;
  createdAt: string;
  lastActivityAt?: string;
  humanReviewDueAt?: string;
  reviewOverdue?: boolean;
  requiresAttention?: boolean;
  latestExceptionCode?: string;
  latestExceptionMessage?: string;
  encounterStatus?: string;
  revenueStatus?: string;
  schedulingStatus?: string;
  notificationStatus?: string;
  bookedAt?: string;
  waitlistQueuedAt?: string;
  approvedBy?: string;
}

function pickStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeWorkflowStatus(status?: string): string {
  if (!status) return 'Processing';
  const normalized = status.replace(/[\s_-]/g, '').toLowerCase();

  if (normalized === 'awaitinghumanreview' || normalized === 'awaitingreview' || normalized === 'pendingreview') {
    return 'AwaitingHumanReview';
  }

  if (normalized === 'completed' || normalized === 'resolved' || normalized === 'approved') {
    return 'Completed';
  }

  if (normalized === 'processing' || normalized === 'inprogress' || normalized === 'pending') {
    return 'Processing';
  }

  return status;
}

function normalizeWorkflowLevel(level: unknown): string {
  if (typeof level === 'number') {
    const byEnum = ['P1_Immediate', 'P2_Urgent', 'P3_Standard', 'P4_NonUrgent'];
    return byEnum[level] ?? 'Pending';
  }

  if (typeof level !== 'string' || !level.trim()) return 'Pending';

  const trimmed = level.trim();
  const normalized = trimmed.replace(/[\s_-]/g, '').toLowerCase();

  if (normalized === 'p1immediate') return 'P1_Immediate';
  if (normalized === 'p2urgent') return 'P2_Urgent';
  if (normalized === 'p3standard') return 'P3_Standard';
  if (normalized === 'p4nonurgent') return 'P4_NonUrgent';

  return trimmed;
}

function normalizeWorkflow(raw: unknown, index: number): TriageWorkflow | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const sessionId = pickStringField(record, ['sessionId', 'SessionId'])
    ?? pickStringField(record, ['id', 'Id', 'workflowId', 'WorkflowId'])
    ?? `session-${index + 1}`;

  const id = pickStringField(record, ['id', 'Id', 'workflowId', 'WorkflowId']) ?? sessionId;
  const status = normalizeWorkflowStatus(pickStringField(record, ['status', 'Status']));
  const triageLevel = normalizeWorkflowLevel(
    record.triageLevel
      ?? record.TriageLevel
      ?? record.assignedLevel
      ?? record.AssignedLevel,
  );

  const createdAtRaw = pickStringField(record, ['createdAt', 'CreatedAt']);
  const createdAt = createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
    ? createdAtRaw
    : new Date().toISOString();

  const confidenceRaw = record.confidenceScore ?? record.ConfidenceScore ?? record.confidence ?? record.Confidence;
  const confidenceScore = typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
    ? confidenceRaw
    : undefined;

  const reviewOverdue = typeof record.reviewOverdue === 'boolean'
    ? record.reviewOverdue
    : typeof record.ReviewOverdue === 'boolean'
    ? record.ReviewOverdue
    : undefined;

  const requiresAttention = typeof record.requiresAttention === 'boolean'
    ? record.requiresAttention
    : typeof record.RequiresAttention === 'boolean'
    ? record.RequiresAttention
    : undefined;

  return {
    id,
    sessionId,
    patientId: pickStringField(record, ['patientId', 'PatientId']),
    patientName: pickStringField(record, ['patientName', 'PatientName']),
    status,
    triageLevel,
    confidenceScore,
    agentReasoning: pickStringField(record, ['agentReasoning', 'AgentReasoning', 'reasoning', 'Reasoning']),
    createdAt,
    lastActivityAt: pickStringField(record, ['lastActivityAt', 'LastActivityAt']),
    humanReviewDueAt: pickStringField(record, ['humanReviewDueAt', 'HumanReviewDueAt']),
    reviewOverdue,
    requiresAttention,
    latestExceptionCode: pickStringField(record, ['latestExceptionCode', 'LatestExceptionCode']),
    latestExceptionMessage: pickStringField(record, ['latestExceptionMessage', 'LatestExceptionMessage']),
    encounterStatus: pickStringField(record, ['encounterStatus', 'EncounterStatus']),
    revenueStatus: pickStringField(record, ['revenueStatus', 'RevenueStatus']),
    schedulingStatus: pickStringField(record, ['schedulingStatus', 'SchedulingStatus']),
    notificationStatus: pickStringField(record, ['notificationStatus', 'NotificationStatus']),
    bookedAt: pickStringField(record, ['bookedAt', 'BookedAt']),
    waitlistQueuedAt: pickStringField(record, ['waitlistQueuedAt', 'WaitlistQueuedAt']),
    approvedBy: pickStringField(record, ['approvedBy', 'ApprovedBy']),
  };
}

function normalizeWorkflowList(data: unknown): TriageWorkflow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw, index) => normalizeWorkflow(raw, index))
    .filter((workflow): workflow is TriageWorkflow => workflow !== null);
}

function workflowStatusFromLevel(level?: string): 'AwaitingHumanReview' | 'Completed' {
  return level === 'P1_Immediate' || level === 'P2_Urgent'
    ? 'AwaitingHumanReview'
    : 'Completed';
}

function workflowFromHandoff(record: WorkflowHandoffRecord): TriageWorkflow {
  return {
    id: record.workflowId,
    sessionId: record.sessionId,
    patientId: record.patientId,
    patientName: record.patientName,
    status: record.status,
    triageLevel: record.triageLevel ?? 'Pending',
    confidenceScore: record.confidenceScore,
    agentReasoning: record.reasoning,
    createdAt: record.createdAt,
    lastActivityAt: record.updatedAt,
  };
}

function getOperationalChipColor(status?: string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Completed': return 'success';
    case 'InProgress':
    case 'Pending': return 'warning';
    case 'Failed':
    case 'NeedsAttention': return 'error';
    default: return 'default';
  }
}

function humanizeStepLabel(label: string): string {
  return label.replace(/Status$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function persistedStatus(status: string): 'Processing' | 'AwaitingHumanReview' | 'Completed' {
  if (status === 'AwaitingHumanReview') return 'AwaitingHumanReview';
  if (status === 'Completed') return 'Completed';
  return 'Processing';
}

function mergeWorkflowLists(...collections: TriageWorkflow[][]): TriageWorkflow[] {
  const merged: TriageWorkflow[] = [];

  for (const collection of collections) {
    for (const workflow of collection) {
      const existingIndex = merged.findIndex((candidate) =>
        candidate.id === workflow.id
        || candidate.sessionId === workflow.sessionId
        || candidate.id === workflow.sessionId
        || candidate.sessionId === workflow.id,
      );

      if (existingIndex >= 0) {
        merged[existingIndex] = { ...merged[existingIndex], ...workflow };
      } else {
        merged.push(workflow);
      }
    }
  }

  return merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function TriageViewer() {
  const [workflows, setWorkflows] = useState<TriageWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'AwaitingHumanReview' | 'Completed' | 'Processing'>('All');
  const [levelFilter, setLevelFilter] = useState<'All' | 'P1_Immediate' | 'P2_Urgent' | 'P3_Standard'>('All');
  // null = unknown (waiting for first probe), true = live, false = down
  const [backendOnline, setBackendOnlineLocal] = useState<boolean | null>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const workflowsRef   = useRef<TriageWorkflow[]>([]);
  // Adaptive poll: 5 s when backend is live, 30 s when returning 404/errors to
  // avoid flooding the APIM gateway (and browser console) when not yet deployed.
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDelayRef   = useRef<number>(5_000);

  function persistWorkflow(
    identifier: string,
    patch: {
      workflowId?: string;
      sessionId?: string;
      patientId?: string;
      patientName?: string;
      transcriptText?: string;
      triageLevel?: string;
      reasoning?: string;
      status: 'Processing' | 'AwaitingHumanReview' | 'Completed';
      approvedBy?: string;
    },
  ) {
    const existing = getWorkflowHandoff(patch.workflowId ?? identifier) ?? getWorkflowHandoff(patch.sessionId ?? identifier);
    const timestamp = new Date().toISOString();

    return upsertWorkflowHandoff({
      workflowId: patch.workflowId ?? existing?.workflowId ?? patch.sessionId ?? identifier,
      sessionId: patch.sessionId ?? existing?.sessionId ?? identifier,
      patientId: patch.patientId ?? existing?.patientId,
      patientName: patch.patientName ?? existing?.patientName,
      transcriptText: patch.transcriptText ?? existing?.transcriptText,
      triageLevel: patch.triageLevel ?? existing?.triageLevel,
      reasoning: patch.reasoning ?? existing?.reasoning,
      confidenceScore: existing?.confidenceScore,
      status: patch.status,
      approvedBy: patch.approvedBy ?? existing?.approvedBy,
      practitionerId: existing?.practitionerId,
      slotId: existing?.slotId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  function integrateWorkflow(record: WorkflowHandoffRecord) {
    setActiveWorkflow(record.workflowId);
    setWorkflows((prev) => mergeWorkflowLists(prev, [workflowFromHandoff(record)]));
  }

  function schedulePoll(delayMs: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollDelayRef.current = delayMs;
    intervalRef.current  = setInterval(doFetch, delayMs);
  }

  async function doFetch() {
    const localWorkflows = loadWorkflowHandoffs().map(workflowFromHandoff);

    // If the global health check already confirmed the backend is down, skip the
    // fetch entirely and show demo data — avoids 404s in the browser console.
    if (backendOnline === false) {
      const fallback = mergeWorkflowLists(DEMO_WORKFLOWS, localWorkflows);
      setWorkflows(prev => prev.length > 0 ? mergeWorkflowLists(prev, localWorkflows) : fallback);
      setLoading(false);
      return;
    }
    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/workflows?top=50`, { signal: controller.signal });
      if (!res.ok) {
        // Backend not deployed (404) or gateway error — back off to 30 s
        if (pollDelayRef.current !== 30_000) schedulePoll(30_000);
        throw new Error(`Server error (${res.status})`);
      }
      const data = await res.json();
      const normalized = normalizeWorkflowList(data);
      const persistedFromBackend = normalized.map((workflow) => workflowFromHandoff(
        persistWorkflow(workflow.sessionId, {
          workflowId: workflow.id,
          sessionId: workflow.sessionId,
          patientId: workflow.patientId,
          patientName: workflow.patientName,
          triageLevel: workflow.triageLevel,
          reasoning: workflow.agentReasoning,
          status: persistedStatus(workflow.status),
        }),
      ));
      const merged = mergeWorkflowLists(normalized, localWorkflows, persistedFromBackend);
      if (Array.isArray(data) && data.length === 0) {
        setWorkflows(localWorkflows);
      } else {
        setWorkflows(merged.length > 0 ? merged : mergeWorkflowLists(DEMO_WORKFLOWS, localWorkflows));
      }
      setError(null);
      // Backend is live — ensure we're polling at the fast 5-second cadence
      if (pollDelayRef.current !== 5_000) schedulePoll(5_000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Backend unavailable — show demo data so the UI remains useful
        const fallback = mergeWorkflowLists(DEMO_WORKFLOWS, localWorkflows);
        setWorkflows(prev => prev.length > 0 ? mergeWorkflowLists(prev, localWorkflows) : fallback);
        setError(null);
        if (pollDelayRef.current !== 30_000) schedulePoll(30_000);
      }
    } finally {
      setLoading(false);
    }
  }

  // Alias for event-driven refresh (e.g. after HITL approval)
  const fetchWorkflows = doFetch;

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  useEffect(() => {
    void doFetch();
    const offTranscript = onTranscriptCompleted(({ detail }) => {
      const record = persistWorkflow(detail.sessionId, {
        workflowId: detail.sessionId,
        sessionId: detail.sessionId,
        transcriptText: detail.transcriptText,
        triageLevel: detail.triageLevel,
        status: 'Processing',
      });
      integrateWorkflow(record);
    });
    const offEscalation = onEscalationRequired(({ detail }) => {
      const incomingId = detail.workflowId ?? detail.sessionId;
      const record = persistWorkflow(incomingId, {
        workflowId: incomingId,
        sessionId: detail.sessionId,
        reasoning: detail.reason,
        status: 'AwaitingHumanReview',
      });
      integrateWorkflow(record);
      const matchedWorkflow = workflowsRef.current.find((workflow) =>
        workflow.id === incomingId
        || workflow.sessionId === detail.sessionId
        || workflow.sessionId === incomingId,
      );
      const fallbackWorkflowId = workflowsRef.current.find(wf => wf.status === 'AwaitingHumanReview')?.id
        ?? workflowsRef.current[0]?.id
        ?? null;
      const resolvedSelection = matchedWorkflow?.id ?? record.workflowId ?? incomingId ?? fallbackWorkflowId;
      setActiveWorkflow(resolvedSelection);
      setSelectedWorkflow(resolvedSelection);
      setShowEscalation(true);
    });
    const offDecision = onAgentDecision(({ detail }) => {
      const record = persistWorkflow(detail.sessionId, {
        workflowId: detail.sessionId,
        sessionId: detail.sessionId,
        triageLevel: detail.triageLevel,
        reasoning: detail.reasoning,
        status: workflowStatusFromLevel(detail.triageLevel),
      });
      integrateWorkflow(record);
    });
    const offApproved = onTriageApproved(({ detail }) => {
      const record = persistWorkflow(detail.workflowId ?? detail.sessionId, {
        workflowId: detail.workflowId,
        sessionId: detail.sessionId,
        patientId: detail.patientId,
        triageLevel: detail.triageLevel,
        status: 'Completed',
        approvedBy: detail.approvedBy,
      });
      integrateWorkflow(record);
      setShowEscalation(false);
    });
    // When shell announces the backend went offline, immediately switch to demo
    // data without waiting for the next poll cycle.
    const offStatus = onBackendStatusChanged(({ detail }) => {
      setBackendOnlineLocal(detail.online);
      if (!detail.online) {
        const localWorkflows = loadWorkflowHandoffs().map(workflowFromHandoff);
        const fallback = mergeWorkflowLists(DEMO_WORKFLOWS, localWorkflows);
        setWorkflows(prev => prev.length > 0 ? mergeWorkflowLists(prev, localWorkflows) : fallback);
        setLoading(false);
      }
    });
    intervalRef.current = setInterval(doFetch, 5_000);
    return () => {
      abortRef.current?.abort();
      offTranscript();
      offEscalation();
      offDecision();
      offApproved();
      offStatus();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendOnline]);

  function getTriageBadgeVariant(level: string) {
    switch (level) {
      case 'P1_Immediate': return 'danger' as const;
      case 'P2_Urgent': return 'warning' as const;
      case 'P3_Standard': return 'default' as const;
      default: return 'secondary' as const;
    }
  }

  if (loading) {
    return (
      <Stack spacing={2}>
        {[0, 1, 2].map(i => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="40%" height={20} />
                    <Skeleton variant="text" width="25%" height={16} />
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Skeleton variant="rounded" width={80} height={24} />
                    <Skeleton variant="rounded" width={70} height={24} />
                  </Stack>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="70%" />
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  const visibleWorkflows = workflows
    .filter(wf => statusFilter === 'All' || wf.status === statusFilter)
    .filter(wf => levelFilter === 'All' || wf.triageLevel === levelFilter);
  const selectedWorkflowData = selectedWorkflow
    ? workflows.find(wf => wf.id === selectedWorkflow || wf.sessionId === selectedWorkflow)
    : null;

  const statusOptions: Array<typeof statusFilter> = ['All', 'AwaitingHumanReview', 'Completed', 'Processing'];
  const levelOptions: Array<typeof levelFilter> = ['All', 'P1_Immediate', 'P2_Urgent', 'P3_Standard'];

  return (
    <>
      {/* Filter bar */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} aria-label="Triage filters">
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary">Status:</Typography>
          {statusOptions.map(s => (
            <Chip
              key={s}
              label={s === 'AwaitingHumanReview' ? 'Awaiting Review' : s}
              size="small"
              variant={statusFilter === s ? 'filled' : 'outlined'}
              color={statusFilter === s ? 'primary' : 'default'}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary">Level:</Typography>
          {levelOptions.map(l => (
            <Chip
              key={l}
              label={l === 'All' ? 'All' : l.replace('_', ' ')}
              size="small"
              variant={levelFilter === l ? 'filled' : 'outlined'}
              color={levelFilter === l ? (l === 'P1_Immediate' ? 'error' : l === 'P2_Urgent' ? 'warning' : 'default') : 'default'}
              onClick={() => setLevelFilter(l)}
            />
          ))}
        </Stack>
      </Stack>

      <Stack spacing={2}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        )}
        {!error && workflows.length === 0 && (
          <Card>
            <CardContent>
              <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
                No triage workflows yet
              </Typography>
            </CardContent>
          </Card>
        )}
        {!error && workflows.length > 0 && visibleWorkflows.length === 0 && (
          <Card>
            <CardContent>
              <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
                No workflows match the active filters.
              </Typography>
            </CardContent>
          </Card>
        )}
        {visibleWorkflows.map((wf) => (
          <Card key={wf.id} sx={{
            cursor: 'pointer',
            borderLeft: wf.triageLevel === 'P1_Immediate' ? '4px solid #d32f2f' : wf.triageLevel === 'P2_Urgent' ? '4px solid #ed6c02' : '4px solid transparent',
            boxShadow: wf.triageLevel === 'P1_Immediate' && wf.status === 'AwaitingHumanReview' ? '0 0 0 1px rgba(211,47,47,0.25)' : undefined,
            '&:hover': { boxShadow: 3 },
          }}
                onClick={() => {
                  setActiveWorkflow(wf.id);
                  setSelectedWorkflow(wf.id);
                }}>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {wf.patientName ?? wf.patientId ?? `Session ${wf.sessionId.substring(0, 8)}...`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(wf.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {Math.round((Date.now() - new Date(wf.createdAt).getTime()) / 60000)}m ago
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Badge variant={getTriageBadgeVariant(wf.triageLevel)}>
                      {wf.triageLevel ?? 'Pending'}
                    </Badge>
                    <Badge variant={wf.status === 'Completed' ? 'success' : 'warning'}>
                      {wf.status}
                    </Badge>
                  </Stack>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {wf.agentReasoning && (
                <StreamingReasoningText text={wf.agentReasoning} />
              )}
              {wf.requiresAttention && wf.latestExceptionMessage && (
                <Alert severity={wf.reviewOverdue ? 'error' : 'warning'} sx={{ mt: 1 }}>
                  {wf.latestExceptionMessage}
                </Alert>
              )}
              {wf.confidenceScore !== undefined && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    AI Confidence
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={wf.confidenceScore}
                    color={wf.confidenceScore >= 90 ? 'error' : wf.confidenceScore >= 75 ? 'warning' : 'success'}
                    sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                  />
                  <Typography variant="caption" fontWeight={700} color={wf.confidenceScore >= 90 ? 'error.main' : 'text.secondary'}>
                    {wf.confidenceScore}%
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {([
                  ['Encounter Status', wf.encounterStatus],
                  ['Revenue Status', wf.revenueStatus],
                  ['Scheduling Status', wf.schedulingStatus],
                  ['Notification Status', wf.notificationStatus],
                ] as const)
                  .filter(([, value]) => value && value !== 'NotStarted')
                  .map(([label, value]) => (
                    <Chip
                      key={`${wf.id}-${label}`}
                      size="small"
                      color={getOperationalChipColor(value)}
                      variant={value === 'Completed' ? 'filled' : 'outlined'}
                      label={`${humanizeStepLabel(label)}: ${value}`}
                    />
                  ))}
                {wf.reviewOverdue && (
                  <Chip size="small" color="error" label="Review overdue" />
                )}
                {wf.bookedAt && (
                  <Chip size="small" color="success" variant="outlined" label="Booked" />
                )}
                {wf.waitlistQueuedAt && (
                  <Chip size="small" color="warning" variant="outlined" label="Waitlist follow-up" />
                )}
              </Stack>
              {wf.status === 'AwaitingHumanReview' && (
                <Button size="sm" sx={{ mt: 1 }} onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setActiveWorkflow(wf.id);
                  setShowEscalation(true);
                  setSelectedWorkflow(wf.id);
                }}>
                  Review & Approve
                </Button>
              )}
              {wf.status === 'Completed' && (
                <Button
                  size="sm"
                  variant="outline"
                  sx={{ mt: 1 }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setActiveWorkflow(wf.id);
                    selectShellTab('hq:tab-scheduling', 0);
                    emitNavigationRequested({
                      path: '/scheduling',
                      reason: `Continue scheduling for ${wf.patientId ?? wf.sessionId}.`,
                    });
                  }}
                >
                  Continue to Scheduling
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
      {showEscalation && selectedWorkflow && (
        <HitlEscalationModal
          workflowId={selectedWorkflowData?.id ?? getActiveWorkflowHandoff()?.workflowId ?? selectedWorkflow}
          sessionId={selectedWorkflowData?.sessionId ?? getActiveWorkflowHandoff()?.sessionId}
          patientId={selectedWorkflowData?.patientId ?? getActiveWorkflowHandoff()?.patientId}
          patientName={selectedWorkflowData?.patientName ?? getActiveWorkflowHandoff()?.patientName}
          triageLevel={selectedWorkflowData?.triageLevel}
          agentReasoning={selectedWorkflowData?.agentReasoning}
          onApprove={() => { setShowEscalation(false); fetchWorkflows(); }}
          onClose={() => setShowEscalation(false)}
        />
      )}
      {AGENT_TRACE_ENABLED && selectedWorkflowData?.sessionId && (
        <Box sx={{ mt: 3 }} aria-label="Agent trace for selected workflow">
          <LiveAgentTrace sessionId={selectedWorkflowData.sessionId} />
        </Box>
      )}
    </>
  );
}

/**
 * W5.2 — wraps AgentTraceViewer with a live ToolInvoked/ToolCompleted feed
 * sourced from Web PubSub. Kept as a separate component so its hooks remount
 * cleanly when the selected session changes.
 */
function LiveAgentTrace({ sessionId }: { sessionId: string }) {
  const liveEvents = useLiveToolEvents(sessionId);
  return <AgentTraceViewer sessionId={sessionId} liveEvents={liveEvents} />;
}
