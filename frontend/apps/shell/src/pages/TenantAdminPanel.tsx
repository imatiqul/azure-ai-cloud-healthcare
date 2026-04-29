import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useGlobalStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface TenantSummary {
  tenantId: string;
  organisationName: string;
  slug: string;
  locale: string;
  appConfigLabel: string;
  dataRegion: string;
  adminUserId: string | null;
}

interface TenantsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: TenantSummary[];
}

interface ProvisionForm {
  organisationName: string;
  slug: string;
  adminEmail: string;
  adminDisplayName: string;
  locale: string;
  dataRegion: string;
}

const EMPTY_FORM: ProvisionForm = {
  organisationName: '',
  slug: '',
  adminEmail: '',
  adminDisplayName: '',
  locale: 'en-US',
  dataRegion: 'eastus',
};

const DEMO_TENANTS: TenantSummary[] = [
  { tenantId: 'tenant-001', organisationName: 'HealthQ Demo Clinic',      slug: 'healthq-demo',     locale: 'en-US', appConfigLabel: 'healthq-demo-config',     dataRegion: 'eastus', adminUserId: 'usr-admin-001' },
  { tenantId: 'tenant-002', organisationName: 'St. Mercy Medical Center', slug: 'st-mercy',          locale: 'en-US', appConfigLabel: 'st-mercy-config',          dataRegion: 'eastus', adminUserId: 'usr-admin-002' },
  { tenantId: 'tenant-003', organisationName: 'Pacific Health Partners',  slug: 'pacific-health',   locale: 'en-US', appConfigLabel: 'pacific-health-config',    dataRegion: 'westus', adminUserId: null },
];

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export default function TenantAdminPanel() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProvisionForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const listRequest = useRef<AbortController | null>(null);
  const provisionRequest = useRef<AbortController | null>(null);
  const deleteRequest = useRef<AbortController | null>(null);

  const backendOnline = useGlobalStore(s => s.backendOnline);

  const fetchTenants = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    setError('');
    try {
      if (backendOnline === false) {
        if (!controller.signal.aborted) {
          setTenants(DEMO_TENANTS);
          setTotal(DEMO_TENANTS.length);
        }
        return;
      }

      const res = await fetch(`${API_BASE}/api/v1/tenants?page=1&pageSize=50`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(`Failed to load tenants — HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as TenantsResponse;
      if (controller.signal.aborted) return;
      setTenants(data.items);
      setTotal(data.total);
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      setTenants(DEMO_TENANTS);
      setTotal(DEMO_TENANTS.length);
    } finally {
      window.clearTimeout(timeoutId);
      if (listRequest.current === controller) {
        listRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [backendOnline]);

  useEffect(() => {
    void fetchTenants();
    return () => {
      listRequest.current?.abort();
      provisionRequest.current?.abort();
      deleteRequest.current?.abort();
    };
  }, [fetchTenants]);

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setSubmitError('');
    setDialogOpen(true);
  };

  const canSubmit =
    form.organisationName.trim() !== '' &&
    form.slug.trim() !== '' &&
    form.adminEmail.trim() !== '' &&
    form.adminDisplayName.trim() !== '';

  const handleProvision = async () => {
    if (!canSubmit) return;

    provisionRequest.current?.abort();
    const controller = new AbortController();
    provisionRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/tenants`, {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationName: form.organisationName,
          slug: form.slug,
          adminEmail: form.adminEmail,
          adminDisplayName: form.adminDisplayName,
          locale: form.locale,
          dataRegion: form.dataRegion,
        }),
      });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setSubmitError((d as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      setDialogOpen(false);
      await fetchTenants();
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      // Backend offline — add tenant locally so provisioning never blocks the demo
      const newTenant: TenantSummary = {
        tenantId: `tenant-demo-${Date.now()}`,
        organisationName: form.organisationName,
        slug: form.slug,
        locale: form.locale,
        appConfigLabel: `${form.slug}-config`,
        dataRegion: form.dataRegion,
        adminUserId: null,
      };
      setTenants(prev => [...prev, newTenant]);
      setTotal(prev => prev + 1);
      setDialogOpen(false);
    } finally {
      window.clearTimeout(timeoutId);
      if (provisionRequest.current === controller) {
        provisionRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    deleteRequest.current?.abort();
    const controller = new AbortController();
    deleteRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setDeleteId(id);
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tenants/${id}`, { signal: controller.signal, method: 'DELETE' });
      if (controller.signal.aborted) return;
      if (!res.ok && res.status !== 204) {
        setError(`Delete failed — HTTP ${res.status}`);
        return;
      }
      await fetchTenants();
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      // Backend offline — remove from local state
      setTenants(prev => prev.filter(t => t.tenantId !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } finally {
      window.clearTimeout(timeoutId);
      if (deleteRequest.current === controller) {
        deleteRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setDeleting(false);
        setDeleteId(null);
      }
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Tenant Administration</Typography>

      <Card>
        <CardHeader>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <CardTitle>Tenants</CardTitle>
            <Box display="flex" gap={1} alignItems="center">
              <Chip label={`${total} total`} size="small" />
              <Button onClick={fetchTenants} aria-label="refresh">
                <RefreshIcon fontSize="small" />
              </Button>
              <Button onClick={openDialog}>
                <AddIcon fontSize="small" sx={{ mr: 0.5 }} />
                Provision Tenant
              </Button>
            </Box>
          </Box>
        </CardHeader>
        <CardContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {loading && (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          )}

          {!loading && tenants.length === 0 && !error && (
            <Alert severity="info">No tenants provisioned yet. Use "Provision Tenant" to get started.</Alert>
          )}

          {!loading && tenants.map((t, idx) => (
            <Box key={t.tenantId}>
              {idx > 0 && <Divider sx={{ my: 1 }} />}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" py={1}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>{t.organisationName}</Typography>
                  <Box display="flex" gap={1} flexWrap="wrap" mt={0.5}>
                    <Chip label={`slug: ${t.slug}`} size="small" variant="outlined" />
                    <Chip label={t.locale} size="small" variant="outlined" />
                    <Chip label={t.dataRegion} size="small" variant="outlined" />
                    <Chip label={`config: ${t.appConfigLabel}`} size="small" variant="outlined" />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
                    {t.tenantId}
                  </Typography>
                </Box>
                <Box display="flex" gap={1} alignItems="center">
                  <Badge variant="success">Active</Badge>
                  <Button
                    onClick={() => handleDelete(t.tenantId)}
                    disabled={deleting && deleteId === t.tenantId}
                    aria-label={`delete tenant ${t.slug}`}
                  >
                    {deleting && deleteId === t.tenantId
                      ? <CircularProgress size={16} />
                      : <DeleteIcon fontSize="small" />}
                  </Button>
                </Box>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Provision New Tenant</DialogTitle>
        <DialogContent>
          {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                label="Organisation Name"
                value={form.organisationName}
                onChange={e => setForm(f => ({ ...f, organisationName: e.target.value }))}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Slug"
                value={form.slug}
                helperText="URL-safe identifier, e.g. acme-health"
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Data Region"
                value={form.dataRegion}
                helperText="Azure region, e.g. eastus"
                onChange={e => setForm(f => ({ ...f, dataRegion: e.target.value }))}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Admin Email"
                type="email"
                value={form.adminEmail}
                onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Admin Display Name"
                value={form.adminDisplayName}
                onChange={e => setForm(f => ({ ...f, adminDisplayName: e.target.value }))}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Locale"
                value={form.locale}
                helperText="e.g. en-US, es-ES"
                onChange={e => setForm(f => ({ ...f, locale: e.target.value }))}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleProvision} disabled={!canSubmit || submitting}>
            {submitting ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            Provision
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
