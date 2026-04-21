import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as EscalationItem[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load escalations');
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicianId: 'clinician-' + Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(id);
      await fetchQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Claim failed');
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicalNote: note.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(null);
      setNote('');
      await fetchQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Resolve failed');
    }
  }

  async function dismiss(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/escalations/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicalNote: 'Dismissed by clinician' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionId(null);
      await fetchQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Dismiss failed');
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
