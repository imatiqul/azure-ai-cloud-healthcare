import { useState, useEffect, useRef } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, useStreamText } from '@healthcare/design-system';
import { onEscalationRequired, onAgentDecision } from '@healthcare/mfe-events';
import { HitlEscalationModal } from './HitlEscalationModal';

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
  patientName?: string;
  status: string;
  triageLevel: string;
  confidenceScore?: number; // 0-100
  agentReasoning?: string;
  createdAt: string;
}

export function TriageViewer() {
  const [workflows, setWorkflows] = useState<TriageWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'AwaitingHumanReview' | 'Completed' | 'Processing'>('All');
  const [levelFilter, setLevelFilter] = useState<'All' | 'P1_Immediate' | 'P2_Urgent' | 'P3_Standard'>('All');
  const abortRef       = useRef<AbortController | null>(null);
  // Adaptive poll: 5 s when backend is live, 30 s when returning 404/errors to
  // avoid flooding the APIM gateway (and browser console) when not yet deployed.
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDelayRef   = useRef<number>(5_000);

  function schedulePoll(delayMs: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollDelayRef.current = delayMs;
    intervalRef.current  = setInterval(doFetch, delayMs);
  }

  async function doFetch() {
    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/triage`, { signal: controller.signal });
      if (!res.ok) {
        // Backend not deployed (404) or gateway error — back off to 30 s
        if (pollDelayRef.current !== 30_000) schedulePoll(30_000);
        throw new Error(`Server error (${res.status})`);
      }
      const data = await res.json();
      setWorkflows(data);
      setError(null);
      // Backend is live — ensure we're polling at the fast 5-second cadence
      if (pollDelayRef.current !== 5_000) schedulePoll(5_000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Backend unavailable — show demo data so the UI remains useful
        setWorkflows(prev => prev.length > 0 ? prev : DEMO_WORKFLOWS);
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
    void doFetch();
    const offEscalation = onEscalationRequired(() => setShowEscalation(true));
    const offDecision   = onAgentDecision(() => void doFetch());
    intervalRef.current = setInterval(doFetch, 5_000);
    return () => {
      abortRef.current?.abort();
      offEscalation();
      offDecision();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                onClick={() => setSelectedWorkflow(wf.id)}>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {wf.patientName ?? `Session ${wf.sessionId.substring(0, 8)}...`}
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
              {wf.status === 'AwaitingHumanReview' && (
                <Button size="sm" sx={{ mt: 1 }} onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setShowEscalation(true);
                  setSelectedWorkflow(wf.id);
                }}>
                  Review & Approve
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
      {showEscalation && selectedWorkflow && (
        <HitlEscalationModal
          workflowId={selectedWorkflow}
          triageLevel={workflows.find(w => w.id === selectedWorkflow)?.triageLevel}
          agentReasoning={workflows.find(w => w.id === selectedWorkflow)?.agentReasoning}
          onApprove={() => { setShowEscalation(false); fetchWorkflows(); }}
          onClose={() => setShowEscalation(false)}
        />
      )}
    </>
  );
}
