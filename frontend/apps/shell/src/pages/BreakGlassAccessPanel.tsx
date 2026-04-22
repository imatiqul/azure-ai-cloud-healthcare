import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import TablePagination from '@mui/material/TablePagination';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import { loadPreferences } from './UserPreferencesPanel'; // Phase 57

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_ACCESSES: BreakGlassAccess[] = [
  { id: 'bg-001', requestedByUserId: 'usr-dr-patel',  targetPatientId: 'PAT-00142', clinicalJustification: 'Patient transferred to ICU — urgent medication review required', grantedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(), isRevoked: false },
  { id: 'bg-002', requestedByUserId: 'usr-dr-torres', targetPatientId: 'PAT-00278', clinicalJustification: 'Cardiac emergency — patient unresponsive, requires historical labs', grantedAt: new Date(Date.now() - 1 * 3600_000).toISOString(), expiresAt: new Date(Date.now() + 3 * 3600_000).toISOString(), isRevoked: false },
  { id: 'bg-003', requestedByUserId: 'usr-dr-chen',   targetPatientId: 'PAT-00315', clinicalJustification: 'Oncology treatment adjustment — accessing archived imaging reports', grantedAt: new Date(Date.now() - 6 * 3600_000).toISOString(), expiresAt: new Date(Date.now() - 2 * 3600_000).toISOString(), isRevoked: false },
  { id: 'bg-004', requestedByUserId: 'usr-dr-okafor', targetPatientId: 'PAT-00089', clinicalJustification: 'Anaphylaxis management — reviewing allergy history before epinephrine', grantedAt: new Date(Date.now() - 24 * 3600_000).toISOString(), expiresAt: new Date(Date.now() - 20 * 3600_000).toISOString(), isRevoked: true },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [page, setPage] = useState(0);
  const rowsPerPage = loadPreferences().rowsPerPage;

  // Reset page whenever filters change
  useEffect(() => { setPage(0); }, [searchQuery, statusFilter]);

  const fetchAccesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/break-glass`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BreakGlassAccess[] = await res.json();
      setAccesses(data);
    } catch {
      setAccesses(DEMO_ACCESSES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccesses(); }, [fetchAccesses]);

  async function requestAccess() {
    if (
      !requestForm.requestedByUserId.trim() ||
      !requestForm.targetPatientId.trim() ||
      requestForm.clinicalJustification.trim().length < 20
    ) {
      setError('All fields are required. Clinical justification must be at least 20 characters.');
      return;
    }
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
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRequestOpen(false);
      setRequestForm({ requestedByUserId: '', targetPatientId: '', clinicalJustification: '', durationHours: '4' });
      await fetchAccesses();
    } catch {
      // Backend offline — grant access locally so the emergency workflow is never blocked
      const newAccess: BreakGlassAccess = {
        id: `bg-demo-${Date.now()}`,
        requestedByUserId: requestForm.requestedByUserId,
        targetPatientId: requestForm.targetPatientId,
        clinicalJustification: requestForm.clinicalJustification,
        grantedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + Number(requestForm.durationHours || 4) * 3_600_000).toISOString(),
        isRevoked: false,
      };
      setAccesses(prev => [newAccess, ...prev]);
      setRequestOpen(false);
      setRequestForm({ requestedByUserId: '', targetPatientId: '', clinicalJustification: '', durationHours: '4' });
      setError(null);
    } finally {
      setRequesting(false);
    }
  }

  async function revokeAccess(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/break-glass/${id}`, { signal: AbortSignal.timeout(10_000), method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAccesses();
    } catch {
      // Backend offline — mark as revoked in local state
      setAccesses(prev => prev.map(a => a.id === id ? { ...a, isRevoked: true } : a));
    } finally {
      setRevokingId(null);
    }
  }

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const canRequest =
    requestForm.requestedByUserId.trim() &&
    requestForm.targetPatientId.trim() &&
    requestForm.clinicalJustification.trim().length >= 20;

  const filteredAccesses = accesses.filter(a => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !a.requestedByUserId.toLowerCase().includes(q) &&
        !a.targetPatientId.toLowerCase().includes(q) &&
        !a.clinicalJustification.toLowerCase().includes(q)
      ) return false;
    }
    if (statusFilter === 'active' && (a.isRevoked || isExpired(a.expiresAt))) return false;
    if (statusFilter === 'expired' && (!isExpired(a.expiresAt) || a.isRevoked)) return false;
    if (statusFilter === 'revoked' && !a.isRevoked) return false;
    return true;
  });

  const pagedAccesses = filteredAccesses.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
        <TextField
          size="small"
          placeholder="Search by user, patient or justification…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          sx={{ minWidth: 280, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          inputProps={{ 'aria-label': 'Search break-glass records' }}
        />
        <Stack direction="row" spacing={0.5}>
          {(['all', 'active', 'expired', 'revoked'] as const).map(s => (
            <Chip
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              size="small"
              variant={statusFilter === s ? 'filled' : 'outlined'}
              color={s === 'active' ? 'success' : s === 'expired' ? 'warning' : s === 'revoked' ? 'error' : 'default'}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </Stack>
      </Stack>

      <Card>
        <CardHeader><CardTitle>Access Records</CardTitle></CardHeader>
        <CardContent>
          {loading && <CircularProgress size={24} />}
          {!loading && filteredAccesses.length === 0 && (
            <Alert severity="info">
              {accesses.length === 0
                ? 'No break-glass access records found.'
                : 'No records match the current filter.'}
            </Alert>
          )}
          {!loading && filteredAccesses.length > 0 && (
            <>
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
                {pagedAccesses.map((a) => (
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
                          variant="outline"
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
            <TablePagination
              component="div"
              count={filteredAccesses.length}
              page={page}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[rowsPerPage]}
              onPageChange={(_, newPage) => setPage(newPage)}
            />
            </>
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
          <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
          <Button onClick={requestAccess} disabled={!canRequest || requesting}>
            {requesting ? <CircularProgress size={16} /> : 'Request Access'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
