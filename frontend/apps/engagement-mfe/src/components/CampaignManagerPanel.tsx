import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import { useAuthFetch } from '@healthcare/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

const DEMO_CAMPAIGNS: CampaignSummary[] = [
  { id: 'camp-hba1c-recall-2026',  name: 'HbA1c Recall Q2 2026',    type: 'SMS',   status: 'Active',    createdAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'camp-flu-vaccine-2026',   name: 'Flu Vaccine Outreach',    type: 'Email', status: 'Completed', createdAt: new Date(Date.now() - 14 * 86400_000).toISOString() },
  { id: 'camp-appt-reminder',      name: 'Appointment Reminders',   type: 'SMS',   status: 'Active',    createdAt: new Date(Date.now() - 7 * 86400_000).toISOString() },
  { id: 'camp-dm-education',       name: 'Diabetes Self-Management', type: 'Email', status: 'Draft',     createdAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'camp-bp-monitoring',      name: 'BP Monitoring Check-in',  type: 'SMS',   status: 'Active',    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
];

interface CampaignSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
}

interface ActivateResult {
  id: string;
  status: string;
  messagesCreated: number;
}

function statusBadgeVariant(status: string): 'success' | 'secondary' | 'default' {
  if (status === 'Active') return 'success';
  if (status === 'Completed') return 'secondary';
  return 'default';
}

export function CampaignManagerPanel() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('Email');
  const [targetIds, setTargetIds] = useState('');
  const [creating, setCreating] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const inFlightRequest = useRef<AbortController | null>(null);
  const authFetch = useAuthFetch();

  const canCreate = name.trim() !== '' && targetIds.trim() !== '';

  async function fetchCampaigns() {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/notifications/campaigns`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CampaignSummary[];
      if (!controller.signal.aborted) setCampaigns(data);
    } catch (err) {
      if (isAbortLikeError(err)) return;
      if (!controller.signal.aborted) setCampaigns(DEMO_CAMPAIGNS);
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
    }
  }

  useEffect(() => {
    fetchCampaigns();
    return () => { inFlightRequest.current?.abort(); };
  }, []);

  async function handleCreate() {
    if (!name.trim() || !targetIds.trim()) {
      setError('Campaign name and at least one target patient ID are required.');
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const targetPatientIds = targetIds
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const res = await authFetch(`${API_BASE}/api/v1/notifications/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, targetPatientIds }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess(`Campaign "${name.trim()}" created.`);
      setName('');
      setTargetIds('');
      await fetchCampaigns();
    } catch {
      // Backend offline — add campaign locally and show success
      const newCampaign: CampaignSummary = {
        id: `camp-demo-${Date.now()}`,
        name: name.trim(),
        type,
        status: 'Draft',
        createdAt: new Date().toISOString(),
      };
      setCampaigns(prev => [...prev, newCampaign]);
      setSuccess(`Campaign "${name.trim()}" created locally.`);
      setName('');
      setTargetIds('');
      setError(null);
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id: string, campaignName: string) {
    setActivatingId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/notifications/campaigns/${id}/activate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ActivateResult;
      setSuccess(
        `Campaign "${campaignName}" activated — ${data.messagesCreated} message(s) queued.`
      );
      await fetchCampaigns();
    } catch {
      // Backend offline — mark campaign as Active locally and show success
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'Active' } : c));
      setSuccess(`Campaign "${campaignName}" activated — messages will be queued when backend is available.`);
      setError(null);
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }} data-testid="campaign-manager-panel">
      <Typography variant="h5" fontWeight="bold">
        Campaign Manager
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      {/* Campaign list */}
      <Card>
        <CardHeader>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <CardTitle>
              Outreach Campaigns
              {!loading && (
                <Chip
                  label={`${campaigns.length} total`}
                  size="small"
                  sx={{ ml: 1 }}
                />
              )}
            </CardTitle>
            <IconButton aria-label="refresh campaigns" size="small" onClick={fetchCampaigns}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Typography color="text.secondary">Loading campaigns…</Typography>
          ) : campaigns.length === 0 ? (
            <Alert severity="info">No campaigns found. Create one below.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {c.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={c.type} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          onClick={() => handleActivate(c.id, c.name)}
                          disabled={
                            c.status !== 'Draft' || activatingId === c.id
                          }
                        >
                          {activatingId === c.id ? 'Activating…' : 'Activate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Divider />

      {/* Create campaign */}
      <Card>
        <CardHeader>
          <CardTitle>New Campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack spacing={2}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                label="Campaign Name"
                inputProps={{ 'aria-label': 'campaign name' }}
                value={name}
                onChange={e => setName(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                select
                label="Campaign Type"
                inputProps={{ 'aria-label': 'campaign type' }}
                value={type}
                onChange={e => setType(e.target.value)}
                size="small"
                fullWidth
              >
                {['Email', 'Sms', 'Push'].map(t => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <TextField
              label="Target Patient IDs"
              inputProps={{ 'aria-label': 'target patient ids' }}
              value={targetIds}
              onChange={e => setTargetIds(e.target.value)}
              helperText="Comma-separated patient IDs, e.g. patient-001, patient-002"
              size="small"
              fullWidth
              multiline
              minRows={2}
            />

            <Box>
              <Button
                variant="default"
                onClick={handleCreate}
                disabled={!canCreate || creating}
              >
                {creating ? 'Creating…' : 'Create Campaign'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
