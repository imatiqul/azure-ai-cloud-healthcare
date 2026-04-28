import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import {
  fetchAgentTrace,
  cancelAgentSession,
  postClinicianFeedback,
  type AgentTraceDto,
  type AgentTraceStep,
} from '../../api/agentTraces';
import { LiveToolFeed, type LiveToolEvent } from './LiveToolFeed';

interface AgentTraceViewerProps {
  sessionId: string;
  /** Poll interval in ms while the session is running. Set to 0 to disable polling. */
  pollMs?: number;
  /** W5.2 — optional live tool events streamed in by the parent (Web PubSub). */
  liveEvents?: LiveToolEvent[];
}

/**
 * W5.1–W5.6 — Agent trace viewer.
 * Hierarchical step tree, inline citations, token + cost strip,
 * clinician feedback widget, and an interrupt button.
 *
 * Backed by the read-only API in `AgentTraceEndpoints` on the Agents service.
 */
export function AgentTraceViewer({ sessionId, pollMs = 1500, liveEvents }: AgentTraceViewerProps) {
  const [trace, setTrace] = useState<AgentTraceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [correction, setCorrection] = useState<string>('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchAgentTrace(sessionId, controller.signal);
        if (cancelled) return;
        setTrace(next);
        setError(null);
        // Stop polling once the run reaches a terminal state.
        if (next && next.status !== 'running' && timer !== undefined) {
          window.clearInterval(timer);
          timer = undefined;
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (pollMs > 0) {
      timer = window.setInterval(load, pollMs);
    }
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [sessionId, pollMs]);

  const isRunning = trace?.status === 'running';

  const tree = useMemo(() => buildTree(trace?.steps ?? []), [trace?.steps]);

  const handleCancel = async () => {
    try { await cancelAgentSession(sessionId); }
    catch (err) { setError((err as Error).message); }
  };

  const handleFeedback = async () => {
    if (rating < 1 || rating > 5) return;
    try {
      await postClinicianFeedback({ sessionId, rating, correction: correction || undefined });
      setFeedbackSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <LinearProgress aria-label="Loading agent trace" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!trace) return <Alert severity="info">No agent trace found for this session.</Alert>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6">Agent trace</Typography>
        <Chip size="small" label={trace.status} color={statusColor(trace.status)} />
        {isRunning && (
          <button type="button" onClick={handleCancel} aria-label="Cancel agent session">
            Cancel
          </button>
        )}
      </Stack>

      <CostStrip trace={trace} />

      {liveEvents && liveEvents.length > 0 && <LiveToolFeed events={liveEvents} />}

      <Box component="ul" sx={{ pl: 2, m: 0 }}>
        {tree.map(node => <TraceNode key={node.step.stepId} node={node} />)}
      </Box>

      {!isRunning && !feedbackSent && (
        <Stack spacing={1} role="form" aria-label="Clinician feedback">
          <Typography variant="subtitle2">Was this helpful?</Typography>
          <Stack direction="row" spacing={0.5}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} of 5`}
                onClick={() => setRating(n)}
                style={{ fontWeight: rating >= n ? 700 : 400 }}
              >
                {n}
              </button>
            ))}
          </Stack>
          <textarea
            placeholder="Optional correction"
            value={correction}
            onChange={e => setCorrection(e.target.value)}
            rows={2}
          />
          <button type="button" onClick={handleFeedback} disabled={rating < 1}>
            Send feedback
          </button>
        </Stack>
      )}
      {feedbackSent && <Alert severity="success">Feedback recorded.</Alert>}
    </Stack>
  );
}

function CostStrip({ trace }: { trace: AgentTraceDto }) {
  const t = trace.totals;
  return (
    <Stack direction="row" spacing={2} sx={{ fontSize: 12, color: 'text.secondary' }}>
      <span>LLM: {t.llmCalls}</span>
      <span>Tools: {t.toolCalls}</span>
      <span>Tokens: {t.promptTokens + t.completionTokens}</span>
      <span>Cost: ${t.estimatedCostUsd.toFixed(4)}</span>
      <span>Time: {t.wallClockSeconds.toFixed(1)}s</span>
    </Stack>
  );
}

interface TreeNode { step: AgentTraceStep; children: TreeNode[]; }

function buildTree(steps: AgentTraceStep[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  steps.forEach(s => byId.set(s.stepId, { step: s, children: [] }));
  const roots: TreeNode[] = [];
  steps.forEach(s => {
    const node = byId.get(s.stepId)!;
    if (s.parentStepId && byId.has(s.parentStepId)) {
      byId.get(s.parentStepId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function TraceNode({ node }: { node: TreeNode }) {
  return (
    <li>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Chip size="small" label={node.step.kind} variant="outlined" />
        <strong>{node.step.agentName}</strong>
        {typeof node.step.confidence === 'number' && (
          <span aria-label="confidence">conf {Math.round(node.step.confidence * 100)}%</span>
        )}
        {node.step.verdict && (
          <Chip size="small" color={node.step.verdict === 'ok' ? 'success' : 'warning'} label={node.step.verdict} />
        )}
      </Stack>
      {node.step.output && (
        <Typography variant="body2" sx={{ pl: 2 }}>{truncate(node.step.output)}</Typography>
      )}
      {node.step.citations.length > 0 && (
        <Box component="ul" sx={{ pl: 4, fontSize: 12 }}>
          {node.step.citations.map(c => (
            <li key={c.sourceId}>
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
              {' '}<span aria-label="score">({c.score.toFixed(2)})</span>
            </li>
          ))}
        </Box>
      )}
      {node.children.length > 0 && (
        <Box component="ul" sx={{ pl: 3 }}>
          {node.children.map(child => <TraceNode key={child.step.stepId} node={child} />)}
        </Box>
      )}
    </li>
  );
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'info';
    case 'cancelled': return 'warning';
    case 'budget_exhausted': return 'warning';
    case 'error': return 'error';
    default: return 'default';
  }
}

function truncate(s: string, max = 280) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
