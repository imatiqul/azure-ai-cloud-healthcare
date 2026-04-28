import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import { useGlobalStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface PractitionerSummary {
  id: string;
  practitionerId: string;
  name: string;
  specialty: string;
  email: string;
  availabilityStart: string;
  availabilityEnd: string;
  timeZoneId: string;
  isActive: boolean;
}

interface FormState {
  practitionerId: string;
  name: string;
  specialty: string;
  email: string;
  availabilityStart: string;
  availabilityEnd: string;
  timeZoneId: string;
}

const EMPTY_FORM: FormState = {
  practitionerId: '',
  name: '',
  specialty: '',
  email: '',
  availabilityStart: '09:00',
  availabilityEnd: '17:00',
  timeZoneId: 'UTC',
};

const DEMO_PRACTITIONERS: PractitionerSummary[] = [
  // Existing
  { id: 'prac-001', practitionerId: 'P001', name: 'Dr. Sarah Patel',     specialty: 'Endocrinology',           email: 'sarah.patel@healthq.demo',     availabilityStart: '08:00', availabilityEnd: '17:00', timeZoneId: 'America/New_York',    isActive: true  },
  { id: 'prac-002', practitionerId: 'P002', name: 'Dr. Michael Torres',  specialty: 'Internal Medicine',        email: 'michael.torres@healthq.demo',  availabilityStart: '09:00', availabilityEnd: '18:00', timeZoneId: 'America/Chicago',     isActive: true  },
  { id: 'prac-003', practitionerId: 'P003', name: 'Dr. Lisa Chen',       specialty: 'Cardiology',               email: 'lisa.chen@healthq.demo',       availabilityStart: '07:30', availabilityEnd: '16:30', timeZoneId: 'America/Los_Angeles', isActive: true  },
  { id: 'prac-004', practitionerId: 'P004', name: 'Emma Walsh RD',       specialty: 'Clinical Nutrition',       email: 'emma.walsh@healthq.demo',      availabilityStart: '10:00', availabilityEnd: '16:00', timeZoneId: 'America/New_York',    isActive: true  },
  { id: 'prac-005', practitionerId: 'P005', name: 'Dr. James Okafor',    specialty: 'Oncology',                 email: 'james.okafor@healthq.demo',    availabilityStart: '08:00', availabilityEnd: '17:00', timeZoneId: 'America/New_York',    isActive: false },
  // New specialist clinicians
  { id: 'prac-006', practitionerId: 'P006', name: 'Dr. Rachel Kim',      specialty: 'Pediatric Pulmonology',    email: 'rachel.kim@healthq.demo',      availabilityStart: '08:00', availabilityEnd: '16:00', timeZoneId: 'America/New_York',    isActive: true  },
  { id: 'prac-007', practitionerId: 'P007', name: 'Dr. Kenji Tanaka',    specialty: 'Psychiatry',               email: 'kenji.tanaka@healthq.demo',    availabilityStart: '09:00', availabilityEnd: '17:00', timeZoneId: 'America/Chicago',     isActive: true  },
  { id: 'prac-008', practitionerId: 'P008', name: 'Dr. Sofia Rivera',    specialty: 'Rheumatology',             email: 'sofia.rivera@healthq.demo',    availabilityStart: '08:30', availabilityEnd: '17:30', timeZoneId: 'America/Los_Angeles', isActive: true  },
  { id: 'prac-009', practitionerId: 'P009', name: 'Dr. Daniel Osei',     specialty: 'Oncology',                 email: 'daniel.osei@healthq.demo',     availabilityStart: '07:00', availabilityEnd: '15:00', timeZoneId: 'America/New_York',    isActive: true  },
  { id: 'prac-010', practitionerId: 'P010', name: 'Dr. Amara Williams',  specialty: 'Neurology',                email: 'amara.williams@healthq.demo',  availabilityStart: '08:00', availabilityEnd: '17:00', timeZoneId: 'America/New_York',    isActive: true  },
  { id: 'prac-011', practitionerId: 'P011', name: 'Dr. Helen Bosworth',  specialty: 'Geriatrics',               email: 'helen.bosworth@healthq.demo',  availabilityStart: '09:00', availabilityEnd: '16:00', timeZoneId: 'America/Chicago',     isActive: true  },
];

export default function PractitionerManager() {
  const [practitioners, setPractitioners] = useState<PractitionerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const backendOnline = useGlobalStore(s => s.backendOnline);

  const fetchPractitioners = useCallback(async () => {
    if (backendOnline === false) {
      setPractitioners(DEMO_PRACTITIONERS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const url = `${API_BASE}/api/v1/scheduling/practitioners/?activeOnly=${showAll ? 'false' : 'true'}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) { setError(`HTTP ${res.status}`); setLoading(false); return; }
      const data = (await res.json()) as PractitionerSummary[];
      setPractitioners(data);
    } catch {
      setPractitioners(DEMO_PRACTITIONERS);
    } finally {
      setLoading(false);
    }
  }, [showAll, backendOnline]);

  useEffect(() => { void fetchPractitioners(); }, [fetchPractitioners]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setSubmitError('');
    setDialogOpen(true);
  }

  function openEdit(p: PractitionerSummary) {
    setEditId(p.id);
    setForm({
      practitionerId: p.practitionerId,
      name: p.name,
      specialty: p.specialty,
      email: p.email,
      availabilityStart: p.availabilityStart,
      availabilityEnd: p.availabilityEnd,
      timeZoneId: p.timeZoneId,
    });
    setSubmitError('');
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const isEdit = editId !== null;
      const url = isEdit
        ? `${API_BASE}/api/v1/scheduling/practitioners/${editId}`
        : `${API_BASE}/api/v1/scheduling/practitioners/`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSubmitError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDialogOpen(false);
      void fetchPractitioners();
    } catch {
      // Backend offline — close dialog and refresh local demo data
      setDialogOpen(false);
      void fetchPractitioners();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(p: PractitionerSummary) {
    try {
      await fetch(`${API_BASE}/api/v1/scheduling/practitioners/${p.id}`, {
        signal: AbortSignal.timeout(10_000),
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          specialty: p.specialty,
          email: p.email,
          availabilityStart: p.availabilityStart,
          availabilityEnd: p.availabilityEnd,
          timeZoneId: p.timeZoneId,
          isActive: !p.isActive,
        }),
      });
      void fetchPractitioners();
    } catch {
      // Backend offline — toggle active status in local state
      setPractitioners(prev => prev.map(p2 => p2.id === p.id ? { ...p2, isActive: !p2.isActive } : p2));
    }
  }

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    };
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Practitioner Management
      </Typography>

      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} gap={2} flexWrap="wrap">
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <FormControlLabel
            control={<Switch checked={showAll} onChange={e => setShowAll(e.target.checked)} />}
            label="Show inactive"
          />
          <TextField
            size="small"
            placeholder="Search by name, specialty or email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            sx={{ minWidth: 260 }}
            inputProps={{ 'aria-label': 'Search practitioners' }}
          />
        </Stack>
        <Button onClick={openCreate}>+ Add Practitioner</Button>
      </Stack>

      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={2}>
        {practitioners
          .filter(p => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
              p.name.toLowerCase().includes(q) ||
              (p.specialty ?? '').toLowerCase().includes(q) ||
              (p.email ?? '').toLowerCase().includes(q) ||
              p.practitionerId.toLowerCase().includes(q)
            );
          })
          .map(p => (
          <Card key={p.id}>
            <CardHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <CardTitle>{p.name}</CardTitle>
                <Stack direction="row" gap={1} alignItems="center">
                  <Badge variant={p.isActive ? 'success' : 'default'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="small" onClick={() => openEdit(p)}>Edit</Button>
                  <Button
                    size="small"
                    onClick={() => void handleToggleActive(p)}
                  >
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </Stack>
              </Stack>
            </CardHeader>
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">ID / NPI</Typography>
                  <Typography variant="body2">{p.practitionerId}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Specialty</Typography>
                  <Typography variant="body2">{p.specialty || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Email</Typography>
                  <Typography variant="body2">{p.email || '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">Availability</Typography>
                  <Typography variant="body2">
                    {p.availabilityStart} – {p.availabilityEnd} ({p.timeZoneId})
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ))}

        {!loading && practitioners.filter(p => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || (p.specialty ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q) || p.practitionerId.toLowerCase().includes(q);
          }).length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {searchQuery.trim() ? 'No practitioners match your search.' : 'No practitioners found. Add one to get started.'}
          </Typography>
        )}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Practitioner' : 'Add Practitioner'}</DialogTitle>
        <DialogContent>
          {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="ID / NPI" fullWidth size="small" required {...field('practitionerId')}
                disabled={editId !== null} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Full Name" fullWidth size="small" required {...field('name')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Specialty" fullWidth size="small" {...field('specialty')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Email" fullWidth size="small" type="email" {...field('email')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="From (HH:mm)" fullWidth size="small" {...field('availabilityStart')}
                placeholder="09:00" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="To (HH:mm)" fullWidth size="small" {...field('availabilityEnd')}
                placeholder="17:00" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Time Zone" fullWidth size="small" {...field('timeZoneId')}
                placeholder="UTC" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !form.name.trim() || !form.practitionerId.trim()}
          >
            {submitting ? 'Saving…' : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
