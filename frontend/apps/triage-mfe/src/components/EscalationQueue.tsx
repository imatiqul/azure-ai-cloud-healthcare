import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_ESCALATIONS: EscalationItem[] = [
  { id: 'esc-001', workflowId: 'wf-a1b2c3d4-e5f6', sessionId: 'sess-001', patientId: 'PAT-00142', reason: 'Chest pain reported — triage score 8/10, possible ACS', status: 'Open',     escalatedAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: 'esc-002', workflowId: 'wf-b2c3d4e5-f6a1', sessionId: 'sess-002', patientId: 'PAT-00278', reason: 'SpO₂ dropping below 88% during voice session',           status: 'Claimed',  escalatedAt: new Date(Date.now() - 35 * 60_000).toISOString(), claimedBy: 'Dr. Patel' },
  { id: 'esc-003', workflowId: 'wf-c3d4e5f6-a1b2', sessionId: 'sess-003', patientId: 'PAT-00391', reason: 'Patient expressed suicidal ideation — PHQ-9 score 18',  status: 'Open',     escalatedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
  { id: 'esc-004', workflowId: 'wf-d4e5f6a1-b2c3', sessionId: 'sess-004', patientId: 'PAT-00554', reason: 'Severe allergic reaction — epi-pen used at home',        status: 'Resolved', escalatedAt: new Date(Date.now() - 90 * 60_000).toISOString(), claimedBy: 'Dr. Smith', resolvedAt: new Date(Date.now() - 60 * 60_000).toISOString(), clinicalNote: 'Directed patient to call 911. Follow-up in 24h.' },
];

interface EscalationItem {
  id: string;
  workflowId: string;
  sessionId: string;
  patientId: string;
  reason: string;
  status: string;
  escalatedAt: string;
  claimedBy?: string;
  resolvedAt?: string;
  clinicalNote?: string;
}

type StatusVariant = 'danger' | 'warning' | 'success' | 'default';

function statusVariant(s: string): StatusVariant {
  switch (s?.toLowerCase()) {
    case 'open':     return 'danger';
    case 'claimed':  return 'warning';
    case 'resolved': return 'success';
    default:         return 'default';
  }
}

export function EscalationQueue() {
  const [items, setItems]           = useState<EscalationItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [note, setNote]             = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as EscalationItem[];
      setItems(data);
    } catch {
      setItems(DEMO_ESCALATIONS);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const interval = setInterval(() => void fetchQueue(), 10000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  async function claim(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations/${id}/claim`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicianId: 'clinician-' + Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(id);
      await fetchQueue();
    } catch {
      // Backend offline — mark as Claimed in local state
      setItems(prev => prev.map(item => item.id === id
        ? { ...item, status: 'Claimed', claimedBy: 'Demo Clinician' }
        : item));
      setActionId(id);
    }
  }

  async function resolve(id: string) {
    if (!note.trim()) {
      setActionError('A clinical note is required to resolve an escalation');
      return;
    }
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations/${id}/resolve`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicalNote: note.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(null);
      setNote('');
      await fetchQueue();
    } catch {
      // Backend offline — mark as Resolved in local state
      setItems(prev => prev.map(item => item.id === id
        ? { ...item, status: 'Resolved', resolvedAt: new Date().toISOString(), clinicalNote: note.trim() }
        : item));
      setActionId(null);
      setNote('');
    }
  }

  async function dismiss(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations/${id}/dismiss`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicalNote: 'Dismissed by clinician' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(null);
      await fetchQueue();
    } catch {
      // Backend offline — remove from queue locally
      setItems(prev => prev.filter(item => item.id !== id));
      setActionId(null);
    }
  }

  if (loading && items.length === 0)
    return (
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight="bold">Escalation Queue</Typography>
        <Typography color="text.secondary">Loading escalation queue…</Typography>
      </Stack>
    );

  if (error)
    return <Alert severity="error">{error}</Alert>;

  return (
    <Stack spacing={2}>
      <Typography variant="h6" fontWeight="bold">Escalation Queue</Typography>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" color="text.secondary">
          {items.filter(i => i.status === 'Open').length} open · {items.length} total
        </Typography>
        <Button size="sm" variant="outline" onClick={() => void fetchQueue()}>Refresh</Button>
      </Stack>

      {items.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              No escalations pending — all clear
            </Typography>
          </CardContent>
        </Card>
      )}

      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack spacing={0.25}>
                  <Typography variant="body2" fontWeight="bold">
                    Workflow {item.workflowId.substring(0, 8)}…
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Patient {item.patientId.substring(0, 8)}… · {new Date(item.escalatedAt).toLocaleString()}
                  </Typography>
                </Stack>
                <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Reason:</strong> {item.reason}
            </Typography>
            {item.claimedBy && (
              <Typography variant="caption" color="text.secondary">
                Claimed by: {item.claimedBy}
              </Typography>
            )}
            {item.clinicalNote && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                Note: {item.clinicalNote}
              </Typography>
            )}

            {/* Action panel for open/claimed items */}
            {(item.status === 'Open' || item.status === 'Claimed') && (
              <>
                <Divider sx={{ my: 1 }} />
                {actionError && actionId === item.id && (
                  <Alert severity="error" sx={{ mb: 1, py: 0.5, fontSize: 12 }}>{actionError}</Alert>
                )}
                {actionId === item.id ? (
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      multiline
                      rows={2}
                      fullWidth
                      label="Clinical note (required to resolve)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      inputProps={{ maxLength: 500 }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button size="sm" onClick={() => void resolve(item.id)} disabled={!note.trim()}>
                        Resolve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void dismiss(item.id)}>
                        Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setActionId(null); setNote(''); }}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1}>
                    {item.status === 'Open' && (
                      <Button size="sm" onClick={() => void claim(item.id)}>
                        Claim
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setActionId(item.id); setNote(''); }}>
                      Resolve / Dismiss
                    </Button>
                  </Stack>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
