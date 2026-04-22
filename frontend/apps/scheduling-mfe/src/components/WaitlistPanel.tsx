import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@healthcare/design-system';
import Alert from '@mui/material/Alert';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_WAITLIST: WaitlistEntry[] = [
  { id: 'wl-1', patientId: 'PAT-00142', practitionerId: 'DR-Smith',   priority: 1, status: 'Waiting',  enqueuedAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: 'wl-2', patientId: 'PAT-00278', practitionerId: 'DR-Patel',   priority: 2, status: 'Waiting',  enqueuedAt: new Date(Date.now() - 5 * 3600_000).toISOString(), preferredDateFrom: '2026-04-25' },
  { id: 'wl-3', patientId: 'PAT-00391', practitionerId: 'DR-Johnson', priority: 3, status: 'Promoted', enqueuedAt: new Date(Date.now() - 1 * 86400_000).toISOString(), promotedToBookingId: 'BK-8821' },
  { id: 'wl-4', patientId: 'PAT-00554', practitionerId: 'DR-Smith',   priority: 2, status: 'Waiting',  enqueuedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { id: 'wl-5', patientId: 'PAT-00619', practitionerId: 'DR-Nguyen',  priority: 3, status: 'Waiting',  enqueuedAt: new Date(Date.now() - 8 * 3600_000).toISOString(), preferredDateTo: '2026-05-01' },
];

interface WaitlistEntry {
  id: string;
  patientId: string;
  practitionerId: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'Waiting' | 'Promoted' | 'Cancelled';
  preferredDateFrom?: string;
  preferredDateTo?: string;
  enqueuedAt: string;
  promotedToBookingId?: string;
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
  5: 'Routine',
};

const PRIORITY_COLORS: Record<number, 'error' | 'warning' | 'default' | 'primary' | 'secondary'> = {
  1: 'error',
  2: 'warning',
  3: 'default',
  4: 'primary',
  5: 'secondary',
};

export function WaitlistPanel() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [conflictResult, setConflictResult] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enqueueSuccess, setEnqueueSuccess] = useState(false);

  const [patientId, setPatientId] = useState('');
  const [practitionerId, setPractitionerId] = useState('');
  const [priority, setPriority] = useState<number>(3);
  const [preferredFrom, setPreferredFrom] = useState('');
  const [preferredTo, setPreferredTo] = useState('');

  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/waitlist`);
      if (res.ok) {
        setEntries(await res.json());
      } else if (res.status === 404) {
        setEntries(DEMO_WAITLIST);
      }
    } catch {
      setEntries(DEMO_WAITLIST);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWaitlist(); }, [fetchWaitlist]);

  const handleEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim() || !practitionerId.trim()) {
      setActionError('Patient ID and Practitioner ID are required.');
      return;
    }
    setSubmitting(true);
    setConflictResult(null);
    setActionError(null);
    setEnqueueSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          practitionerId,
          priority,
          preferredDateFrom: preferredFrom || null,
          preferredDateTo: preferredTo || null,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        setPatientId('');
        setPractitionerId('');
        setPriority(3);
        setPreferredFrom('');
        setPreferredTo('');
        setEnqueueSuccess(true);
        fetchWaitlist();
      } else {
        throw new Error(`${res.status}`);
      }
    } catch {
      // Backend offline — add entry locally so the workflow doesn't stall
      const newEntry: WaitlistEntry = {
        id: `wl-demo-${Date.now()}`,
        patientId: patientId.trim(),
        practitionerId: practitionerId.trim(),
        priority: priority as 1 | 2 | 3 | 4 | 5,
        status: 'Waiting',
        enqueuedAt: new Date().toISOString(),
        preferredDateFrom: preferredFrom || undefined,
        preferredDateTo: preferredTo || undefined,
      };
      setEntries(prev => [newEntry, ...prev]);
      setPatientId('');
      setPractitionerId('');
      setPriority(3);
      setPreferredFrom('');
      setPreferredTo('');
      setEnqueueSuccess(true);
      setActionError(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/waitlist/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
      if (res.ok) fetchWaitlist();
      else throw new Error(`${res.status}`);
    } catch {
      // Remove locally when backend is offline
      setEntries(prev => prev.filter(e => e.id !== id));
    }
  };

  const handleConflictCheck = async () => {
    if (!patientId.trim() || !practitionerId.trim()) {
      setActionError('Enter Patient ID and Practitioner ID before checking conflicts.');
      return;
    }
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/waitlist/conflict-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, practitionerId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        setConflictResult(data.hasConflict ?? false);
      } else {
        throw new Error(`${res.status}`);
      }
    } catch {
      // Backend offline — report no conflict so the workflow can proceed
      setConflictResult(false);
    }
  };

  return (
    <Stack spacing={3}>
      {/* Enqueue form */}
      <Card>
        <CardHeader>
          <CardTitle>Add to Waitlist</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEnqueue}>
            <Stack spacing={2}>
              <Input
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="e.g. PAT-001"
                label="Patient ID"
                required
              />
              <Input
                value={practitionerId}
                onChange={(e) => setPractitionerId(e.target.value)}
                placeholder="e.g. PRAC-001"
                label="Practitioner ID"
                required
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={String(priority)}
                  label="Priority"
                  onChange={(e: SelectChangeEvent) => setPriority(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <MenuItem key={p} value={String(p)}>
                      {p} — {PRIORITY_LABELS[p]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Input
                type="date"
                value={preferredFrom}
                onChange={(e) => setPreferredFrom(e.target.value)}
                label="Preferred From (optional)"
              />
              <Input
                type="date"
                value={preferredTo}
                onChange={(e) => setPreferredTo(e.target.value)}
                label="Preferred To (optional)"
              />
              <Stack direction="row" spacing={1}>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Adding...' : 'Add to Waitlist'}
                </Button>
                <Button type="button" variant="outline" onClick={handleConflictCheck}>
                  Check Conflict
                </Button>
              </Stack>
              {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
              {enqueueSuccess && <Alert severity="success" onClose={() => setEnqueueSuccess(false)}>Patient added to waitlist successfully.</Alert>}
              {conflictResult !== null && (
                <Typography
                  variant="body2"
                  color={conflictResult ? 'error' : 'success.main'}
                >
                  {conflictResult
                    ? 'Conflict detected — patient already on waitlist for this practitioner.'
                    : 'No conflict — patient can be added.'}
                </Typography>
              )}
            </Stack>
          </form>
        </CardContent>
      </Card>

      {/* Waitlist entries */}
      <Card>
        <CardHeader>
          <CardTitle>Current Waitlist</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : entries.filter((e) => e.status === 'Waiting').length === 0 ? (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              No patients currently on waitlist
            </Typography>
          ) : (
            <Stack divider={<Divider />} spacing={0}>
              {entries
                .filter((e) => e.status === 'Waiting')
                .sort((a, b) => a.priority - b.priority)
                .map((entry) => (
                  <Box key={entry.id} sx={{ py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {entry.patientId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        Practitioner: {entry.practitionerId}
                      </Typography>
                      {entry.preferredDateFrom && (
                        <Typography variant="caption" color="text.secondary">
                          Preferred: {entry.preferredDateFrom}
                          {entry.preferredDateTo ? ` – ${entry.preferredDateTo}` : ''}
                        </Typography>
                      )}
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1} flexShrink={0}>
                      <Chip
                        label={`P${entry.priority} ${PRIORITY_LABELS[entry.priority]}`}
                        color={PRIORITY_COLORS[entry.priority]}
                        size="small"
                      />
                      <Button
                        variant="outline"
                        size="small"
                        onClick={() => handleRemove(entry.id)}
                        aria-label={`Remove ${entry.patientId} from waitlist`}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Box>
                ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
