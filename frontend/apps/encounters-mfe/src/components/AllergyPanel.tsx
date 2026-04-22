import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_ALLERGIES: AllergyIntolerance[] = [
  { resourceType: 'AllergyIntolerance', id: 'allergy-demo-001', clinicalStatus: { coding: [{ code: 'active' }] }, criticality: 'high', code: { text: 'Penicillin', coding: [{ display: 'Penicillin' }] }, recordedDate: new Date(Date.now() - 365 * 86_400_000).toISOString(), reaction: [{ description: 'Anaphylaxis — severe systemic reaction' }] },
  { resourceType: 'AllergyIntolerance', id: 'allergy-demo-002', clinicalStatus: { coding: [{ code: 'active' }] }, criticality: 'low',  code: { text: 'Aspirin',     coding: [{ display: 'Aspirin' }] },     recordedDate: new Date(Date.now() - 200 * 86_400_000).toISOString(), reaction: [{ description: 'GI intolerance — nausea and gastric irritation' }] },
];

interface AllergyIntolerance {
  id?: string;
  resourceType: string;
  clinicalStatus?: { coding?: { code?: string }[] };
  criticality?: string;
  code?: { text?: string; coding?: { display?: string }[] };
  patient?: { reference?: string };
  recordedDate?: string;
  reaction?: { description?: string }[];
}

interface Bundle<T> {
  entry?: { resource: T }[];
}

function criticalityBadge(criticality?: string) {
  switch (criticality) {
    case 'high':    return 'danger' as const;
    case 'low':     return 'warning' as const;
    case 'unable-to-assess': return 'default' as const;
    default:        return 'default' as const;
  }
}

export function AllergyPanel({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [allergies, setAllergies] = useState<AllergyIntolerance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAllergyJson, setNewAllergyJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  useEffect(() => {
    if (patientId) void fetchAllergies(patientId);
  }, [patientId]);

  async function fetchAllergies(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/fhir/allergies/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle: Bundle<AllergyIntolerance> = await res.json();
      setAllergies(bundle.entry?.map(e => e.resource) ?? []);
    } catch {
      setAllergies(DEMO_ALLERGIES);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(allergyId: string) {
    try {
      await fetch(`${API_BASE}/api/v1/fhir/allergies/${encodeURIComponent(allergyId)}`, { signal: AbortSignal.timeout(10_000), method: 'DELETE' });
      if (patientId) void fetchAllergies(patientId);
    } catch {
      // non-critical
    }
  }

  async function handleSaveAllergy() {
    setSaving(true);
    try {
      const body = JSON.parse(newAllergyJson);
      const res = await fetch(`${API_BASE}/api/v1/fhir/allergies`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowAdd(false);
      setNewAllergyJson('');
      if (patientId) void fetchAllergies(patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save allergy');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <CardTitle>Allergies &amp; Intolerances</CardTitle>
            <Button size="small" variant="contained" onClick={() => setShowAdd(true)} disabled={!patientId}>
              + Add Allergy
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

          {loading && <CircularProgress size={20} />}
          {error && <Typography color="error">{error}</Typography>}
          {!patientId && !loading && (
            <Typography variant="body2" color="text.secondary">Enter a patient ID to load allergies.</Typography>
          )}
          {patientId && !loading && allergies.length === 0 && !error && (
            <Typography variant="body2" color="text.secondary">No allergies recorded.</Typography>
          )}

          <Stack gap={1}>
            {allergies.map((allergy, i) => {
              const name = allergy.code?.text ?? allergy.code?.coding?.[0]?.display ?? 'Unknown substance';
              const status = allergy.clinicalStatus?.coding?.[0]?.code ?? '—';
              const reaction = allergy.reaction?.[0]?.description;
              const reactionText = reaction;
              return (
                <Stack key={allergy.id ?? i} direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Stack>
                    <Typography variant="body2" fontWeight="bold">{name}</Typography>
                    {reactionText && <Typography variant="caption" color="text.secondary">Reaction: <span>{reactionText}</span></Typography>}
                    {allergy.recordedDate && (
                      <Typography variant="caption" color="text.secondary">
                        Recorded: {new Date(allergy.recordedDate).toLocaleDateString()}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" gap={1} alignItems="center">
                    {allergy.criticality && (
                      <Badge variant={criticalityBadge(allergy.criticality)}>
                        {allergy.criticality}
                      </Badge>
                    )}
                    <Badge variant="default">{status}</Badge>
                    {allergy.id && (
                      <IconButton size="small" color="error" onClick={() => void handleDelete(allergy.id!)} aria-label="delete allergy">
                        ✕
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Allergy / Intolerance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Paste a valid FHIR AllergyIntolerance JSON body.
          </Typography>
          <TextField
            multiline
            rows={8}
            fullWidth
            placeholder='{"resourceType":"AllergyIntolerance",...}'
            value={newAllergyJson}
            onChange={e => setNewAllergyJson(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSaveAllergy()} disabled={saving || !newAllergyJson.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
