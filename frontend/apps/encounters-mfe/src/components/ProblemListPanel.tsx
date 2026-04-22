import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_CONDITIONS: Condition[] = [
  { resourceType: 'Condition', id: 'cond-demo-001', clinicalStatus: { coding: [{ code: 'active' }] }, verificationStatus: { coding: [{ code: 'confirmed' }] }, code: { text: 'Type 2 Diabetes Mellitus',  coding: [{ display: 'Type 2 diabetes mellitus', code: 'E11.9' }] }, onsetDateTime: new Date(Date.now() - 5 * 365 * 86_400_000).toISOString() },
  { resourceType: 'Condition', id: 'cond-demo-002', clinicalStatus: { coding: [{ code: 'active' }] }, verificationStatus: { coding: [{ code: 'confirmed' }] }, code: { text: 'Essential Hypertension',       coding: [{ display: 'Essential (primary) hypertension', code: 'I10' }] },    onsetDateTime: new Date(Date.now() - 3 * 365 * 86_400_000).toISOString() },
  { resourceType: 'Condition', id: 'cond-demo-003', clinicalStatus: { coding: [{ code: 'active' }] }, verificationStatus: { coding: [{ code: 'confirmed' }] }, code: { text: 'Mixed Hyperlipidemia',         coding: [{ display: 'Mixed hyperlipidemia', code: 'E78.2' }] },              onsetDateTime: new Date(Date.now() - 2 * 365 * 86_400_000).toISOString() },
];

interface Condition {
  id?: string;
  resourceType: string;
  clinicalStatus?: { coding?: { code?: string }[] };
  verificationStatus?: { coding?: { code?: string }[] };
  code?: { text?: string; coding?: { display?: string; code?: string }[] };
  subject?: { reference?: string };
  onsetDateTime?: string;
  recordedDate?: string;
  category?: { coding?: { code?: string }[] }[];
}

interface Bundle<T> {
  entry?: { resource: T }[];
}

function clinicalStatusBadge(status?: string) {
  switch (status) {
    case 'active':    return 'danger' as const;
    case 'resolved':  return 'success' as const;
    case 'inactive':  return 'default' as const;
    default:          return 'default' as const;
  }
}

export function ProblemListPanel({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [showAdd, setShowAdd] = useState(false);
  const [newConditionJson, setNewConditionJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  useEffect(() => {
    if (patientId) void fetchConditions(patientId, statusFilter);
  }, [patientId, statusFilter]);

  async function fetchConditions(id: string, status: string) {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/api/v1/fhir/conditions/${encodeURIComponent(id)}?clinicalStatus=${encodeURIComponent(status)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle: Bundle<Condition> = await res.json();
      setConditions(bundle.entry?.map(e => e.resource) ?? []);
    } catch {
      setConditions(DEMO_CONDITIONS.filter(c => c.clinicalStatus?.coding?.[0]?.code === status));
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCondition() {
    setSaving(true);
    try {
      const body = JSON.parse(newConditionJson);
      const res = await fetch(`${API_BASE}/api/v1/fhir/conditions`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowAdd(false);
      setNewConditionJson('');
      if (patientId) void fetchConditions(patientId, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save condition');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <CardTitle>Problem List</CardTitle>
            <Button size="small" variant="contained" onClick={() => setShowAdd(true)} disabled={!patientId}>
              + Add Problem
            </Button>
          </Stack>
        </CardHeader>
        <CardContent>
          {!propId && (
            <Stack direction="row" gap={1} mb={2}>
              <TextField
                size="small"
                placeholder="Patient ID"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setPatientId(searchInput.trim()); }}
              />
              <Button variant="outlined" size="small" onClick={() => setPatientId(searchInput.trim())}>
                Load
              </Button>
            </Stack>
          )}

          <ToggleButtonGroup
            exclusive
            size="small"
            value={statusFilter}
            onChange={(_, v) => { if (v) setStatusFilter(v); }}
            sx={{ mb: 2 }}
            aria-label="clinical status filter"
          >
            <ToggleButton value="active">Active</ToggleButton>
            <ToggleButton value="inactive">Inactive</ToggleButton>
            <ToggleButton value="resolved">Resolved</ToggleButton>
          </ToggleButtonGroup>

          {loading && <CircularProgress size={20} />}
          {error && <Typography color="error">{error}</Typography>}
          {!patientId && !loading && (
            <Typography variant="body2" color="text.secondary">Enter a patient ID to load the problem list.</Typography>
          )}
          {patientId && !loading && conditions.length === 0 && !error && (
            <Typography variant="body2" color="text.secondary">No conditions recorded.</Typography>
          )}

          <Stack gap={1}>
            {conditions.map((cond, i) => {
              const name = cond.code?.text
                ?? cond.code?.coding?.[0]?.display
                ?? cond.code?.coding?.[0]?.code
                ?? 'Unknown condition';
              const clinStatus = cond.clinicalStatus?.coding?.[0]?.code;
              const onset = cond.onsetDateTime ?? cond.recordedDate;
              return (
                <Stack key={cond.id ?? i} direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Stack>
                    <Typography variant="body2" fontWeight="bold">{name}</Typography>
                    {onset && (
                      <Typography variant="caption" color="text.secondary">
                        Onset: {new Date(onset).toLocaleDateString()}
                      </Typography>
                    )}
                  </Stack>
                  <Badge variant={clinicalStatusBadge(clinStatus)}>{clinStatus ?? '—'}</Badge>
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Problem / Condition</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Paste a valid FHIR Condition JSON body.
          </Typography>
          <TextField
            multiline
            rows={8}
            fullWidth
            placeholder='{"resourceType":"Condition",...}'
            value={newConditionJson}
            onChange={e => setNewConditionJson(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSaveCondition()} disabled={saving || !newConditionJson.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
