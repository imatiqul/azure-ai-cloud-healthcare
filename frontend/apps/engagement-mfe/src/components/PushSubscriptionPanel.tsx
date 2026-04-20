import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableBody from '@mui/material/TableBody';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Types matching NotificationEndpoints push-subscriptions ───────────────
interface PushSubscription {
  id: string;
  endpoint: string;
  createdAt: string;
}

interface RegisterPayload {
  patientId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function PushSubscriptionPanel() {
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientId, setPatientId] = useState('');
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  // Register form
  const [endpoint, setEndpoint] = useState('');
  const [p256dh, setP256dh] = useState('');
  const [auth, setAuth] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async (pid: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/notifications/push-subscriptions?patientId=${encodeURIComponent(pid)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PushSubscription[] = await res.json();
      setSubscriptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (patientId) fetchSubscriptions(patientId);
  }, [patientId, fetchSubscriptions]);

  function handleSearch() {
    const pid = patientIdInput.trim();
    if (pid) setPatientId(pid);
  }

  async function handleRegister() {
    if (!endpoint.trim() || !p256dh.trim() || !auth.trim()) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const payload: RegisterPayload = {
        patientId,
        endpoint: endpoint.trim(),
        p256dh: p256dh.trim(),
        auth: auth.trim(),
      };
      const res = await fetch(`${API_BASE}/api/v1/notifications/push-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRegisterOpen(false);
      setEndpoint('');
      setP256dh('');
      setAuth('');
      fetchSubscriptions(patientId);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register subscription');
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/notifications/push-subscriptions/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (patientId) fetchSubscriptions(patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subscription');
    } finally {
      setDeleting(null);
    }
  }

  const canRegister = endpoint.trim() !== '' && p256dh.trim() !== '' && auth.trim() !== '';

  return (
    <>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5" fontWeight="bold">
            Web Push Subscriptions
          </Typography>
          {patientId && (
            <IconButton onClick={() => fetchSubscriptions(patientId)} aria-label="refresh" size="small">
              <RefreshIcon />
            </IconButton>
          )}
        </Stack>

        <Card>
          <CardHeader>
            <CardTitle>Patient Push Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Patient ID"
                  size="small"
                  sx={{ flex: 1 }}
                  value={patientIdInput}
                  onChange={(e) => setPatientIdInput(e.target.value)}
                  placeholder="Enter patient ID to view subscriptions"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="secondary" onClick={handleSearch} disabled={!patientIdInput.trim()}>
                  Search
                </Button>
                {patientId && (
                  <Button variant="primary" onClick={() => setRegisterOpen(true)}>
                    + Register
                  </Button>
                )}
              </Stack>

              {error && <Alert severity="error">{error}</Alert>}
              {loading && <CircularProgress size={24} />}

              {!loading && patientId && subscriptions.length === 0 && (
                <Alert severity="info">No active push subscriptions for this patient.</Alert>
              )}

              {!loading && subscriptions.length > 0 && (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Endpoint</TableCell>
                      <TableCell>Registered</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {subscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.endpoint}
                        </TableCell>
                        <TableCell>
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">Active</Badge>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`unregister ${sub.id}`}
                            onClick={() => handleDelete(sub.id)}
                            disabled={deleting === sub.id}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.secondary">
          Web Push subscriptions are used to deliver real-time browser notifications to patients.
          Each subscription is tied to a specific browser installation. Tokens are encrypted
          using VAPID keys and never stored in plaintext.
        </Typography>
      </Stack>

      {/* ── Register dialog ──────────────────────────────────────────────── */}
      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register Push Subscription</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {registerError && <Alert severity="error">{registerError}</Alert>}
            <TextField
              label="Endpoint URL"
              size="small"
              fullWidth
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://fcm.googleapis.com/fcm/send/..."
            />
            <TextField
              label="P256DH Key"
              size="small"
              fullWidth
              value={p256dh}
              onChange={(e) => setP256dh(e.target.value)}
              placeholder="Base64-encoded public key"
            />
            <TextField
              label="Auth Secret"
              size="small"
              fullWidth
              value={auth}
              onChange={(e) => setAuth(e.target.value)}
              placeholder="Base64-encoded auth secret"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={() => setRegisterOpen(false)} disabled={registering}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleRegister} disabled={registering || !canRegister}>
            {registering ? 'Registering…' : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
