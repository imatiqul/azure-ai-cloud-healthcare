import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import InsightsIcon from '@mui/icons-material/Insights';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ReplayIcon from '@mui/icons-material/Replay';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HistoryIcon from '@mui/icons-material/History';
import { Card, CardContent, CardHeader, CardTitle } from '@healthcare/design-system';
import { selectShellTab, setActiveWorkflow } from '@healthcare/mfe-events';
import { useWorkflowOpsStream } from '../hooks/useWorkflowOpsStream';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type WorkflowFilter = 'All' | 'Attention' | 'AwaitingReview' | 'Scheduling' | 'Booked';

interface WorkflowSummaryMetrics {
  total: number;
  awaitingHumanReview: number;
  attentionRequired: number;
  bookedToday: number;
  waitlistFallbacks: number;
  reviewOverdue: number;
  averageReviewMinutes: number | null;
  automationCompletionRate: number | null;
  autoBooked: number;
  manualBooked: number;
}

interface WorkflowRecord {
  id: string;
  sessionId: string;
  patientId: string;
  patientName?: string;
  status: string;
  triageLevel?: string;
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
  currentPractitionerId?: string;
  currentSlotId?: string;
  bookingId?: string;
  escalationStatus?: string;
  escalationAssignee?: string;
}

const DEMO_SUMMARY: WorkflowSummaryMetrics = {
  total: 24,
  awaitingHumanReview: 5,
  attentionRequired: 4,
  bookedToday: 6,
  waitlistFallbacks: 2,
  reviewOverdue: 1,
  averageReviewMinutes: 16.8,
  automationCompletionRate: 0.79,
  autoBooked: 4,
  manualBooked: 2,
};

const DEMO_WORKFLOWS: WorkflowRecord[] = [
  {
    id: 'wf-1001',
    sessionId: '6e87ab77-9480-48d6-b30b-b10000000001',
    patientId: '8f87ab77-9480-48d6-b30b-b10000000011',
    patientName: 'James Chen',
    status: 'AwaitingHumanReview',
    triageLevel: 'P1_Immediate',
    lastActivityAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    humanReviewDueAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    reviewOverdue: true,
    requiresAttention: true,
    latestExceptionCode: 'REVIEW_SLA',
    latestExceptionMessage: 'Urgent workflow is still waiting for clinician approval.',
    encounterStatus: 'Completed',
    revenueStatus: 'Completed',
    schedulingStatus: 'Pending',
    notificationStatus: 'Pending',
    escalationStatus: 'Claimed',
    escalationAssignee: 'dr.smith',
  },
  {
    id: 'wf-1002',
    sessionId: '6e87ab77-9480-48d6-b30b-b10000000002',
    patientId: '8f87ab77-9480-48d6-b30b-b10000000012',
    patientName: 'Alice Morgan',
    status: 'Completed',
    triageLevel: 'P3_Standard',
    lastActivityAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    requiresAttention: true,
    latestExceptionCode: 'SCHEDULING_FAILED',
    latestExceptionMessage: 'Automatic booking failed and the patient was placed on the waitlist.',
    encounterStatus: 'Completed',
    revenueStatus: 'Completed',
    schedulingStatus: 'NeedsAttention',
    notificationStatus: 'Completed',
    waitlistQueuedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    currentPractitionerId: 'prac-200',
  },
  {
    id: 'wf-1003',
    sessionId: '6e87ab77-9480-48d6-b30b-b10000000003',
    patientId: '8f87ab77-9480-48d6-b30b-b10000000013',
    patientName: 'Sarah O\'Brien',
    status: 'Completed',
    triageLevel: 'P4_NonUrgent',
    lastActivityAt: new Date(Date.now() - 18 * 60_000).toISOString(),
    encounterStatus: 'Completed',
    revenueStatus: 'Completed',
    schedulingStatus: 'Completed',
    notificationStatus: 'Completed',
    bookedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    bookingId: 'bk-444',
    currentSlotId: 'slot-901',
    currentPractitionerId: 'prac-101',
  },
];

type ActionStep = 'encounter' | 'revenue' | 'notification' | 'scheduling';

interface ApproveDialogState {
  workflowId: string;
  patientName?: string;
}

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  note?: string;
  timestamp: string;
}

function ApproveDialog({
  state,
  onConfirm,
  onClose,
}: {
  state: ApproveDialogState;
  onConfirm: (workflowId: string, note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Approve Escalation Review</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Approve the escalation review for <strong>{state.patientName ?? state.workflowId}</strong>.
          Scheduling will be triggered automatically after approval.
        </Typography>
        <TextField
          label="Approval note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckCircleOutlineIcon />}
          onClick={() => onConfirm(state.workflowId, note)}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeWorkflow(record: unknown): WorkflowRecord | null {
  if (!record || typeof record !== 'object') return null;

  const item = record as Record<string, unknown>;
  const id = asString(item.id) ?? asString(item.Id);
  const sessionId = asString(item.sessionId) ?? asString(item.SessionId);
  const patientId = asString(item.patientId) ?? asString(item.PatientId);

  if (!id || !sessionId || !patientId) return null;

  return {
    id,
    sessionId,
    patientId,
    patientName: asString(item.patientName) ?? asString(item.PatientName),
    status: asString(item.status) ?? asString(item.Status) ?? 'Processing',
    triageLevel: asString(item.triageLevel) ?? asString(item.TriageLevel),
    lastActivityAt: asString(item.lastActivityAt) ?? asString(item.LastActivityAt),
    humanReviewDueAt: asString(item.humanReviewDueAt) ?? asString(item.HumanReviewDueAt),
    reviewOverdue: asBoolean(item.reviewOverdue) ?? asBoolean(item.ReviewOverdue),
    requiresAttention: asBoolean(item.requiresAttention) ?? asBoolean(item.RequiresAttention),
    latestExceptionCode: asString(item.latestExceptionCode) ?? asString(item.LatestExceptionCode),
    latestExceptionMessage: asString(item.latestExceptionMessage) ?? asString(item.LatestExceptionMessage),
    encounterStatus: asString(item.encounterStatus) ?? asString(item.EncounterStatus),
    revenueStatus: asString(item.revenueStatus) ?? asString(item.RevenueStatus),
    schedulingStatus: asString(item.schedulingStatus) ?? asString(item.SchedulingStatus),
    notificationStatus: asString(item.notificationStatus) ?? asString(item.NotificationStatus),
    bookedAt: asString(item.bookedAt) ?? asString(item.BookedAt),
    waitlistQueuedAt: asString(item.waitlistQueuedAt) ?? asString(item.WaitlistQueuedAt),
    approvedBy: asString(item.approvedBy) ?? asString(item.ApprovedBy),
    currentPractitionerId: asString(item.currentPractitionerId) ?? asString(item.CurrentPractitionerId),
    currentSlotId: asString(item.currentSlotId) ?? asString(item.CurrentSlotId),
    bookingId: asString(item.bookingId) ?? asString(item.BookingId),
    escalationStatus: asString(item.escalationStatus) ?? asString(item.EscalationStatus),
    escalationAssignee: asString(item.escalationAssignee) ?? asString(item.EscalationAssignee),
  };
}

function normalizeWorkflowList(data: unknown): WorkflowRecord[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeWorkflow)
    .filter((item): item is WorkflowRecord => item !== null)
    .sort((left, right) => Date.parse(right.lastActivityAt ?? right.bookedAt ?? '') - Date.parse(left.lastActivityAt ?? left.bookedAt ?? ''));
}

function normalizeSummary(data: unknown): WorkflowSummaryMetrics | null {
  if (!data || typeof data !== 'object') return null;
  const item = data as Record<string, unknown>;

  const total = asNumber(item.total) ?? asNumber(item.Total);
  const awaitingHumanReview = asNumber(item.awaitingHumanReview) ?? asNumber(item.AwaitingHumanReview);
  const attentionRequired = asNumber(item.attentionRequired) ?? asNumber(item.AttentionRequired);
  const bookedToday = asNumber(item.bookedToday) ?? asNumber(item.BookedToday);
  const waitlistFallbacks = asNumber(item.waitlistFallbacks) ?? asNumber(item.WaitlistFallbacks);
  const reviewOverdue = asNumber(item.reviewOverdue) ?? asNumber(item.ReviewOverdue);
  const averageReviewMinutes = asNumber(item.averageReviewMinutes) ?? asNumber(item.AverageReviewMinutes);
  const automationCompletionRate = asNumber(item.automationCompletionRate) ?? asNumber(item.AutomationCompletionRate);
  const autoBooked = asNumber(item.autoBooked) ?? asNumber(item.AutoBooked);
  const manualBooked = asNumber(item.manualBooked) ?? asNumber(item.ManualBooked);

  if (total === null || awaitingHumanReview === null || attentionRequired === null || bookedToday === null || waitlistFallbacks === null || reviewOverdue === null || autoBooked === null || manualBooked === null) {
    return null;
  }

  return {
    total,
    awaitingHumanReview,
    attentionRequired,
    bookedToday,
    waitlistFallbacks,
    reviewOverdue,
    averageReviewMinutes,
    automationCompletionRate,
    autoBooked,
    manualBooked,
  };
}

function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return 'No activity yet';

  const deltaMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(deltaMs)) return 'No activity yet';

  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;

  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

function formatStepLabel(label?: string): string {
  if (!label) return 'Unknown';
  return label.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function stepChipColor(status?: string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Completed': return 'success';
    case 'Pending':
    case 'InProgress': return 'warning';
    case 'NeedsAttention':
    case 'Failed': return 'error';
    default: return 'default';
  }
}

function statusChipColor(status?: string): 'default' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Completed': return 'success';
    case 'AwaitingHumanReview': return 'warning';
    case 'Processing': return 'default';
    default: return 'default';
  }
}

function matchesFilter(workflow: WorkflowRecord, filter: WorkflowFilter): boolean {
  switch (filter) {
    case 'Attention':
      return workflow.requiresAttention === true;
    case 'AwaitingReview':
      return workflow.status === 'AwaitingHumanReview' || workflow.reviewOverdue === true;
    case 'Scheduling':
      return workflow.schedulingStatus === 'Failed'
        || workflow.schedulingStatus === 'NeedsAttention'
        || !!workflow.waitlistQueuedAt;
    case 'Booked':
      return !!workflow.bookedAt;
    default:
      return true;
  }
}

function SummaryCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ mt: 0.75 }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {detail}
          </Typography>
        </Box>
        <Box sx={{ color: 'primary.main', opacity: 0.8 }}>
          {icon}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function WorkflowOperationsWorkbench() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WorkflowSummaryMetrics>(DEMO_SUMMARY);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>(DEMO_WORKFLOWS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<WorkflowFilter>('Attention');
  const [usingDemo, setUsingDemo] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState('');
  const [approveDialog, setApproveDialog] = useState<ApproveDialogState | null>(null);
  const [auditLogWorkflowId, setAuditLogWorkflowId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const inFlightRequest = useRef<AbortController | null>(null);

  // ── Real-time workflow updates via Web PubSub ────────────────────────────
  const { lastUpdate, connectionState, clearLiveCache } = useWorkflowOpsStream('supervisor', !usingDemo);

  // Merge incoming live updates into local workflow list
  useEffect(() => {
    if (!lastUpdate) return;
    const updated = lastUpdate.workflow;
    setWorkflows(prev =>
      prev.map(wf =>
        wf.id === updated.id
          ? {
              ...wf,
              status: updated.status,
              requiresAttention: updated.requiresAttention,
              escalationStatus: updated.escalationStatus,
              schedulingStatus: updated.schedulingStatus,
              encounterStatus: updated.encounterStatus,
              revenueStatus: updated.revenueStatus,
              notificationStatus: updated.notificationStatus,
              approvedBy: updated.approvedBy,
              approvedAt: updated.approvedAt,
              latestExceptionCode: updated.latestExceptionCode,
              latestExceptionMessage: updated.latestExceptionMessage,
            }
          : wf,
      ),
    );
  }, [lastUpdate]);

  const loadWorkbench = useCallback(async () => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError('');
    clearLiveCache();

    try {
      const [summaryResponse, workflowResponse] = await Promise.all([
        fetch(`${API_BASE}/api/v1/agents/workflows/summary`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/v1/agents/workflows?top=80`, { signal: controller.signal }),
      ]);

      if (!summaryResponse.ok || !workflowResponse.ok) {
        throw new Error('Workflow operations endpoints are unavailable.');
      }

      const [summaryJson, workflowJson] = await Promise.all([
        summaryResponse.json(),
        workflowResponse.json(),
      ]);

      const nextSummary = normalizeSummary(summaryJson);
      const nextWorkflows = normalizeWorkflowList(workflowJson);
      if (!nextSummary || nextWorkflows.length === 0) {
        throw new Error('Workflow operations data is incomplete.');
      }

      if (!controller.signal.aborted) {
        setSummary(nextSummary);
        setWorkflows(nextWorkflows);
        setUsingDemo(false);
      }
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) return;
      if (!controller.signal.aborted) {
        setSummary(DEMO_SUMMARY);
        setWorkflows(DEMO_WORKFLOWS);
        setUsingDemo(true);
        setError('Showing fallback workflow operations data because the live endpoints are unavailable.');
      }
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) {
        inFlightRequest.current = null;
        setLoading(false);
      }
    }
  }, [clearLiveCache]);

  useEffect(() => {
    void loadWorkbench();
    return () => { inFlightRequest.current?.abort(); };
  }, [loadWorkbench]);

  const filteredWorkflows = useMemo(
    () => workflows.filter((workflow) => matchesFilter(workflow, filter)),
    [filter, workflows],
  );

  // ── Operator action helpers ──────────────────────────────────────────────

  const executeAction = useCallback(async (
    workflowId: string,
    key: string,
    url: string,
    body?: unknown,
  ) => {
    if (usingDemo) {
      setActionError('Operator actions are unavailable in demo mode.');
      return;
    }
    setActionInFlight((prev) => new Set(prev).add(key));
    setActionError('');
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        setActionError(text || `Action failed (${response.status}).`);
        return;
      }
      // Optimistically update the single workflow record from the response
      const updated = (await response.json()) as unknown;
      const normalized = normalizeWorkflow(updated);
      if (normalized) {
        setWorkflows((prev) => prev.map((item) => item.id === workflowId ? normalized : item));
      }
    } catch {
      setActionError('The action could not be completed. Check your connection and try again.');
    } finally {
      setActionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [usingDemo]);

  const handleApprove = useCallback((workflowId: string, note: string) => {
    setApproveDialog(null);
    void executeAction(
      workflowId,
      `${workflowId}:approve`,
      `/api/v1/agents/workflows/${workflowId}/approve`,
      { approvedBy: 'supervisor', approvalNote: note || undefined },
    );
  }, [executeAction]);

  const handleClaimEscalation = useCallback((workflowId: string) => {
    void executeAction(
      workflowId,
      `${workflowId}:claim`,
      `/api/v1/agents/workflows/${workflowId}/escalation/claim`,
      { claimedBy: 'supervisor' },
    );
  }, [executeAction]);

  const handleReleaseEscalation = useCallback((workflowId: string) => {
    void executeAction(
      workflowId,
      `${workflowId}:release`,
      `/api/v1/agents/workflows/${workflowId}/escalation/release`,
    );
  }, [executeAction]);

  const handleRetryStep = useCallback((workflowId: string, step: ActionStep) => {
    void executeAction(
      workflowId,
      `${workflowId}:retry-${step}`,
      `/api/v1/agents/workflows/${workflowId}/retry/${step}`,
    );
  }, [executeAction]);

  const handleRequeueScheduling = useCallback((workflowId: string) => {
    void executeAction(
      workflowId,
      `${workflowId}:requeue`,
      `/api/v1/agents/workflows/${workflowId}/requeue-scheduling`,
    );
  }, [executeAction]);

  const toggleAuditLog = useCallback(async (workflowId: string) => {
    if (auditLogWorkflowId === workflowId) {
      setAuditLogWorkflowId(null);
      setAuditLog([]);
      return;
    }
    setAuditLogWorkflowId(workflowId);
    setAuditLog([]);
    if (usingDemo) return;
    setAuditLogLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/workflows/${workflowId}/audit-log`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = (await res.json()) as unknown[];
        setAuditLog(data.map((e) => {
          const entry = e as Record<string, unknown>;
          return {
            id: String(entry.id ?? ''),
            actor: String(entry.actor ?? 'unknown'),
            action: String(entry.action ?? ''),
            note: typeof entry.note === 'string' ? entry.note : undefined,
            timestamp: String(entry.timestamp ?? ''),
          };
        }));
      }
    } catch { /* silently ignore */ }
    finally { setAuditLogLoading(false); }
  }, [auditLogWorkflowId, usingDemo]);

  const openWorkflow = useCallback((workflow: WorkflowRecord, destination: 'triage' | 'scheduling') => {
    setActiveWorkflow(workflow.id);

    if (destination === 'scheduling') {
      const tabIndex = workflow.waitlistQueuedAt ? 2 : workflow.bookedAt ? 0 : 1;
      selectShellTab('hq:tab-scheduling', tabIndex);
      navigate('/scheduling');
      return;
    }

    selectShellTab('hq:tab-triage', 0);
    navigate('/triage');
  }, [navigate]);

  const automationRate = summary.automationCompletionRate === null
    ? 'N/A'
    : `${(summary.automationCompletionRate * 100).toFixed(1)}%`;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Workflow Operations Workbench
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            Supervisor view for review backlog, scheduling failures, waitlist fallbacks, and closed-loop automation health.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          {usingDemo && <Chip size="small" color="warning" label="Demo fallback" />}
          {!usingDemo && (
            <Tooltip title={connectionState === 'connected' ? 'Live updates active' : connectionState === 'connecting' ? 'Connecting…' : 'Live updates unavailable'}>
              <Chip
                size="small"
                icon={<FiberManualRecordIcon sx={{ fontSize: 10 }} />}
                label={connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Offline'}
                color={connectionState === 'connected' ? 'success' : connectionState === 'connecting' ? 'default' : 'default'}
                variant={connectionState === 'connected' ? 'filled' : 'outlined'}
              />
            </Tooltip>
          )}
          <Tooltip title="Refresh workflow operations">
            <IconButton aria-label="Refresh workflow operations" onClick={() => void loadWorkbench()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity={usingDemo ? 'warning' : 'error'} sx={{ mb: 2 }}>{error}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 2 }}>{actionError}</Alert>}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Attention Required"
            value={summary.attentionRequired.toString()}
            detail={`${summary.reviewOverdue} review SLA breach${summary.reviewOverdue === 1 ? '' : 's'}`}
            icon={<WarningAmberIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Awaiting Human Review"
            value={summary.awaitingHumanReview.toString()}
            detail={summary.averageReviewMinutes === null ? 'No approvals recorded yet' : `${summary.averageReviewMinutes.toFixed(1)} min average review time`}
            icon={<AssignmentTurnedInIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Booked Today"
            value={summary.bookedToday.toString()}
            detail={`${summary.autoBooked} auto-booked, ${summary.manualBooked} manual`}
            icon={<CalendarMonthIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Automation Health"
            value={automationRate}
            detail={`${summary.waitlistFallbacks} waitlist fallback${summary.waitlistFallbacks === 1 ? '' : 's'} this week`}
            icon={<InsightsIcon />}
          />
        </Grid>
      </Grid>

      <Card sx={{ mt: 3 }}>
        <CardHeader>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
            <Box>
              <CardTitle>Operational Queue</CardTitle>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Focus the list on the workflows that need intervention right now.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(['All', 'Attention', 'AwaitingReview', 'Scheduling', 'Booked'] as WorkflowFilter[]).map((value) => (
                <Chip
                  key={value}
                  label={value === 'AwaitingReview' ? 'Awaiting Review' : value}
                  color={filter === value ? 'primary' : 'default'}
                  variant={filter === value ? 'filled' : 'outlined'}
                  onClick={() => setFilter(value)}
                  clickable
                  size="small"
                />
              ))}
            </Stack>
          </Stack>
        </CardHeader>
        <CardContent>
          {filteredWorkflows.length === 0 ? (
            <Alert severity="success">No workflows match the selected filter.</Alert>
          ) : (
            <Stack spacing={2}>
              {filteredWorkflows.map((workflow) => (
                <Paper key={workflow.id} variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
                  <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                        <Typography variant="subtitle1" fontWeight={700}>
                          {workflow.patientName ?? workflow.patientId}
                        </Typography>
                        <Chip size="small" label={workflow.status} color={statusChipColor(workflow.status)} />
                        {workflow.requiresAttention && <Chip size="small" color="error" label="Attention required" />}
                        {workflow.reviewOverdue && <Chip size="small" color="error" label="Review overdue" />}
                        {workflow.waitlistQueuedAt && <Chip size="small" color="warning" label="Waitlist fallback" icon={<EventBusyIcon />} />}
                        {workflow.bookedAt && <Chip size="small" color="success" label="Booked" />}
                      </Stack>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        Patient {workflow.patientId} · Workflow {workflow.id} · {workflow.triageLevel ?? 'Unscored'}
                      </Typography>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                        <Chip size="small" variant="outlined" label={`Encounter: ${formatStepLabel(workflow.encounterStatus)}`} color={stepChipColor(workflow.encounterStatus)} />
                        <Chip size="small" variant="outlined" label={`Revenue: ${formatStepLabel(workflow.revenueStatus)}`} color={stepChipColor(workflow.revenueStatus)} />
                        <Chip size="small" variant="outlined" label={`Scheduling: ${formatStepLabel(workflow.schedulingStatus)}`} color={stepChipColor(workflow.schedulingStatus)} />
                        <Chip size="small" variant="outlined" label={`Notifications: ${formatStepLabel(workflow.notificationStatus)}`} color={stepChipColor(workflow.notificationStatus)} />
                      </Stack>

                      {(workflow.latestExceptionMessage || workflow.escalationStatus) && (
                        <Box sx={{ mt: 1.5 }}>
                          {workflow.latestExceptionMessage && (
                            <Alert severity={workflow.requiresAttention ? 'error' : 'warning'} sx={{ mb: workflow.escalationStatus ? 1.25 : 0 }}>
                              <Typography variant="body2" fontWeight={600}>
                                {workflow.latestExceptionCode ?? 'Workflow exception'}
                              </Typography>
                              <Typography variant="body2">{workflow.latestExceptionMessage}</Typography>
                            </Alert>
                          )}
                          {workflow.escalationStatus && (
                            <Typography variant="caption" color="text.secondary">
                              Escalation: {workflow.escalationStatus}
                              {workflow.escalationAssignee ? ` · assigned to ${workflow.escalationAssignee}` : ''}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>

                    <Stack spacing={1.25} sx={{ minWidth: { xs: '100%', lg: 240 } }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatRelativeTime(workflow.lastActivityAt ?? workflow.bookedAt ?? workflow.waitlistQueuedAt)}
                      </Typography>
                      {workflow.humanReviewDueAt && (
                        <Typography variant="caption" color="text.secondary">
                          Review due {new Date(workflow.humanReviewDueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      )}
                      <Divider />

                      {/* Primary navigation actions */}
                      <Button variant="contained" endIcon={<OpenInNewIcon />} onClick={() => openWorkflow(workflow, 'triage')}>
                        Review in Triage
                      </Button>
                      <Button variant="outlined" onClick={() => openWorkflow(workflow, 'scheduling')}>
                        Open Scheduling
                      </Button>

                      {/* Operator write actions */}
                      {workflow.status === 'AwaitingHumanReview' && (
                        <Tooltip title="Approve escalation and trigger scheduling">
                          <span>
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              fullWidth
                              startIcon={<CheckCircleOutlineIcon />}
                              disabled={actionInFlight.has(`${workflow.id}:approve`)}
                              onClick={() => setApproveDialog({ workflowId: workflow.id, patientName: workflow.patientName })}
                            >
                              {actionInFlight.has(`${workflow.id}:approve`) ? 'Approving…' : 'Approve'}
                            </Button>
                          </span>
                        </Tooltip>
                      )}

                      {workflow.escalationStatus === 'Open' && (
                        <Tooltip title="Claim this escalation to indicate you are reviewing it">
                          <span>
                            <Button
                              variant="outlined"
                              color="info"
                              size="small"
                              fullWidth
                              startIcon={<PersonAddIcon />}
                              disabled={actionInFlight.has(`${workflow.id}:claim`)}
                              onClick={() => handleClaimEscalation(workflow.id)}
                            >
                              {actionInFlight.has(`${workflow.id}:claim`) ? 'Claiming…' : 'Claim'}
                            </Button>
                          </span>
                        </Tooltip>
                      )}

                      {workflow.escalationStatus === 'Claimed' && (
                        <Tooltip title="Release your claim so another supervisor can pick it up">
                          <span>
                            <Button
                              variant="outlined"
                              size="small"
                              fullWidth
                              startIcon={<PersonOffIcon />}
                              disabled={actionInFlight.has(`${workflow.id}:release`)}
                              onClick={() => handleReleaseEscalation(workflow.id)}
                            >
                              {actionInFlight.has(`${workflow.id}:release`) ? 'Releasing…' : 'Release Claim'}
                            </Button>
                          </span>
                        </Tooltip>
                      )}

                      {workflow.encounterStatus === 'Failed' && (
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          fullWidth
                          startIcon={<ReplayIcon />}
                          disabled={actionInFlight.has(`${workflow.id}:retry-encounter`)}
                          onClick={() => handleRetryStep(workflow.id, 'encounter')}
                        >
                          {actionInFlight.has(`${workflow.id}:retry-encounter`) ? 'Retrying…' : 'Retry Encounter'}
                        </Button>
                      )}

                      {workflow.revenueStatus === 'Failed' && (
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          fullWidth
                          startIcon={<ReplayIcon />}
                          disabled={actionInFlight.has(`${workflow.id}:retry-revenue`)}
                          onClick={() => handleRetryStep(workflow.id, 'revenue')}
                        >
                          {actionInFlight.has(`${workflow.id}:retry-revenue`) ? 'Retrying…' : 'Retry Revenue'}
                        </Button>
                      )}

                      {workflow.notificationStatus === 'Failed' && (
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          fullWidth
                          startIcon={<ReplayIcon />}
                          disabled={actionInFlight.has(`${workflow.id}:retry-notification`)}
                          onClick={() => handleRetryStep(workflow.id, 'notification')}
                        >
                          {actionInFlight.has(`${workflow.id}:retry-notification`) ? 'Retrying…' : 'Retry Notification'}
                        </Button>
                      )}

                      {(workflow.schedulingStatus === 'Failed' || workflow.schedulingStatus === 'NeedsAttention') && (
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          fullWidth
                          startIcon={<EventAvailableIcon />}
                          disabled={actionInFlight.has(`${workflow.id}:requeue`)}
                          onClick={() => handleRequeueScheduling(workflow.id)}
                        >
                          {actionInFlight.has(`${workflow.id}:requeue`) ? 'Requeueing…' : 'Requeue Scheduling'}
                        </Button>
                      )}

                      <Divider />
                      <Button
                        variant="text"
                        size="small"
                        fullWidth
                        startIcon={<HistoryIcon />}
                        onClick={() => void toggleAuditLog(workflow.id)}
                      >
                        {auditLogWorkflowId === workflow.id ? 'Hide Audit Log' : 'Audit Log'}
                      </Button>
                    </Stack>
                  </Stack>

                  {/* Collapsible audit trail */}
                  <Collapse in={auditLogWorkflowId === workflow.id} unmountOnExit>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Operator Audit Log
                      </Typography>
                      {auditLogLoading && <LinearProgress sx={{ mt: 1 }} />}
                      {usingDemo && !auditLogLoading && (
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                          Audit log unavailable in demo mode.
                        </Typography>
                      )}
                      {!usingDemo && !auditLogLoading && auditLog.length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                          No operator actions recorded yet.
                        </Typography>
                      )}
                      {!auditLogLoading && auditLog.length > 0 && (
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          {auditLog.map((entry) => (
                            <Box key={entry.id} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 130, flexShrink: 0 }}>
                                {new Date(entry.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </Typography>
                              <Typography variant="caption" fontWeight={600} sx={{ flexShrink: 0 }}>
                                {entry.actor}
                              </Typography>
                              <Typography variant="caption" sx={{ flexShrink: 0 }}>
                                {entry.action}
                              </Typography>
                              {entry.note && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                  — {entry.note}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </Collapse>
                </Paper>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {approveDialog && (
        <ApproveDialog
          state={approveDialog}
          onConfirm={handleApprove}
          onClose={() => setApproveDialog(null)}
        />
      )}
    </Box>
  );
}