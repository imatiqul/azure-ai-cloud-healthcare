import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface BreakGlassAccess {
  id: string;
  requestedByUserId: string;
  targetPatientId: string;
  clinicalJustification: string;
  grantedAt: string;
  expiresAt: string;
  isRevoked?: boolean;
}

interface RequestForm {
  requestedByUserId: string;
  targetPatientId: string;
  clinicalJustification: string;
  durationHours: string;
}

export default function BreakGlassAccessPanel() {
  const [accesses, setAccesses] = useState<BreakGlassAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<RequestForm>({
    requestedByUserId: '',
    targetPatientId: '',
    clinicalJustification: '',
    durationHours: '4',
  });
  const [requesting, setRequesting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchAccesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/break-glass`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BreakGlassAccess[] = await res.json();
      setAccesses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load break-glass records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccesses(); }, [fetchAccesses]);

  async function requestAccess() {
    setRequesting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        requestedByUserId: requestForm.requestedByUserId,
        targetPatientId: requestForm.targetPatientId,
        clinicalJustification: requestForm.clinicalJustification,
      };
      if (requestForm.durationHours) body.durationHours = Number(requestForm.durationHours);
      const res = await fetch(`${API_BASE}/api/v1/identity/break-glass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRequestOpen(false);
      setRequestForm({ requestedByUserId: '', targetPatientId: '', clinicalJustification: '', durationHours: '4' });
      await fetchAccesses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request break-glass access');
    } finally {
      setRequesting(false);
    }
  }

  async function revokeAccess(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/break-glass/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAccesses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    } finally {
      setRevokingId(null);
    }
  }

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const canRequest =
    requestForm.requestedByUserId.trim() &&
    requestForm.targetPatientId.trim() &&
    requestForm.clinicalJustification.trim().length >= 20;

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Break-Glass Emergency Access
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={`${accesses.length} records`} size="small" />
          <IconButton size="small" onClick={fetchAccesses} disabled={loading} aria-label="refresh break-glass">
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button onClick={() => setRequestOpen(true)} disabled={loading}>
            Request Access
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Alert severity="warning">
        HIPAA §164.312(a)(2)(ii) — All break-glass access events are logged and supervisor-notified.
        Use only for genuine clinical emergencies.
      </Alert>

      <Card>
        <CardHeader><CardTitle>Access Records</CardTitle></CardHeader>
        <CardContent>
          {loading && <CircularProgress size={24} />}
          {!loading && accesses.length === 0 && (
            <Alert severity="info">No break-glass access records found.</Alert>
          )}
          {!loading && accesses.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Requesting User</TableCell>
                  <TableCell>Target Patient</TableCell>
                  <TableCell>Justification</TableCell>
                  <TableCell>Granted At</TableCell>
                  <TableCell>Expires At</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accesses.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">{a.requestedByUserId}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">{a.targetPatientId}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {a.clinicalJustification}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{new Date(a.grantedAt).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{new Date(a.expiresAt).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell>
                      {a.isRevoked ? (
                        <Badge color="default">Revoked</Badge>
                      ) : isExpired(a.expiresAt) ? (
                        <Badge color="default">Expired</Badge>
                      ) : (
                        <Badge color="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!a.isRevoked && !isExpired(a.expiresAt) && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => revokeAccess(a.id)}
                          disabled={revokingId === a.id}
                          aria-label={`revoke access ${a.id}`}
                        >
                          {revokingId === a.id ? <CircularProgress size={14} /> : 'Revoke'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Request Dialog */}
      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Break-Glass Emergency Access</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Requesting User ID"
                fullWidth
                required
                value={requestForm.requestedByUserId}
                onChange={(e) => setRequestForm((f) => ({ ...f, requestedByUserId: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Target Patient ID"
                fullWidth
                required
                value={requestForm.targetPatientId}
                onChange={(e) => setRequestForm((f) => ({ ...f, targetPatientId: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Clinical Justification (min 20 chars)"
                fullWidth
                required
                multiline
                rows={3}
                value={requestForm.clinicalJustification}
                onChange={(e) => setRequestForm((f) => ({ ...f, clinicalJustification: e.target.value }))}
                helperText={`${requestForm.clinicalJustification.length} / 20 minimum`}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Duration (hours, 1–8)"
                type="number"
                fullWidth
                inputProps={{ min: 1, max: 8 }}
                value={requestForm.durationHours}
                onChange={(e) => setRequestForm((f) => ({ ...f, durationHours: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setRequestOpen(false)}>Cancel</Button>
          <Button onClick={requestAccess} disabled={!canRequest || requesting}>
            {requesting ? <CircularProgress size={16} /> : 'Request Access'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
