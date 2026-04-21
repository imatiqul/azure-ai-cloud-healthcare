import { useState, useEffect, useRef } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';
import { onEscalationRequired, onAgentDecision } from '@healthcare/mfe-events';
import { HitlEscalationModal } from './HitlEscalationModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface TriageWorkflow {
  id: string;
  sessionId: string;
  status: string;
  triageLevel: string;
  agentReasoning?: string;
  createdAt: string;
}

export function TriageViewer() {
  const [workflows, setWorkflows] = useState<TriageWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchWorkflows() {
    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/triage`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setWorkflows(data);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Failed to load triage workflows. Retrying automatically.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkflows();
    const offEscalation = onEscalationRequired(() => setShowEscalation(true));
    const offDecision = onAgentDecision(() => fetchWorkflows());
    const interval = setInterval(fetchWorkflows, 5000);
    return () => {
      abortRef.current?.abort();
      offEscalation();
      offDecision();
      clearInterval(interval);
    };
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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <>
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
        {workflows.map((wf) => (
          <Card key={wf.id} sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => setSelectedWorkflow(wf.id)}>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <span>Session {wf.sessionId.substring(0, 8)}...</span>
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
              <Typography variant="body2" color="text.secondary">
                Created: {new Date(wf.createdAt).toLocaleString()}
              </Typography>
              {wf.agentReasoning && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                  AI: {wf.agentReasoning}
                </Typography>
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
