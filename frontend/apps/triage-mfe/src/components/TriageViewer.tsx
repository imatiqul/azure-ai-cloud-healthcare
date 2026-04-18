import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';
import { HitlEscalationModal } from './HitlEscalationModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface TriageWorkflow {
  id: string;
  sessionId: string;
  status: string;
  triageLevel: string;
  createdAt: string;
}

export function TriageViewer() {
  const [workflows, setWorkflows] = useState<TriageWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);

  useEffect(() => {
    fetchWorkflows();
    const handleEscalation = () => setShowEscalation(true);
    window.addEventListener('mfe:escalation:required', handleEscalation);
    return () => window.removeEventListener('mfe:escalation:required', handleEscalation);
  }, []);

  async function fetchWorkflows() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/triage`);
      const data = await res.json();
      setWorkflows(data);
    } catch { /* no-op */ }
  }

  function getTriageBadgeVariant(level: string) {
    switch (level) {
      case 'P1_Immediate': return 'danger' as const;
      case 'P2_Urgent': return 'warning' as const;
      case 'P3_Standard': return 'default' as const;
      default: return 'secondary' as const;
    }
  }

  return (
    <>
      <Stack spacing={2}>
        {workflows.length === 0 && (
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
                      {wf.triageLevel}
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
          onApprove={async () => {
            await fetch(`${API_BASE}/api/v1/agents/triage/${selectedWorkflow}/approve`, { method: 'POST' });
            setShowEscalation(false);
            fetchWorkflows();
          }}
          onClose={() => setShowEscalation(false)}
        />
      )}
    </>
  );
}
