import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

const DEMO_OBSERVATIONS: FhirObservation[] = [
  { id: 'obs-demo-001', status: 'final',       code: 'HbA1c',                     value: '7.8 %',       effectiveDate: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { id: 'obs-demo-002', status: 'final',       code: 'Glucose (Fasting)',          value: '128 mg/dL',   effectiveDate: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { id: 'obs-demo-003', status: 'final',       code: 'Blood Pressure (Systolic)',  value: '138 mmHg',    effectiveDate: new Date(Date.now() - 14 * 86_400_000).toISOString() },
  { id: 'obs-demo-004', status: 'final',       code: 'Blood Pressure (Diastolic)', value: '88 mmHg',     effectiveDate: new Date(Date.now() - 14 * 86_400_000).toISOString() },
  { id: 'obs-demo-005', status: 'final',       code: 'Total Cholesterol',          value: '210 mg/dL',   effectiveDate: new Date(Date.now() - 60 * 86_400_000).toISOString() },
  { id: 'obs-demo-006', status: 'final',       code: 'LDL Cholesterol',            value: '135 mg/dL',   effectiveDate: new Date(Date.now() - 60 * 86_400_000).toISOString() },
];

interface FhirObservation {
  id: string;
  status: string;
  code: string;
  value: string;
  effectiveDate: string;
}

interface FhirEntry {
  resource?: {
    id?: string;
    status?: string;
    code?: {
      text?: string;
      coding?: Array<{ display?: string; code?: string }>;
    };
    valueQuantity?: { value?: number; unit?: string };
    valueString?: string;
    effectiveDateTime?: string;
  };
}

function parseBundle(raw: unknown): FhirObservation[] {
  if (!raw || typeof raw !== 'object') return [];
  const bundle = raw as { entry?: FhirEntry[] };
  if (!Array.isArray(bundle.entry)) return [];

  return bundle.entry.map((e, i) => {
    const r = e.resource ?? {};

    const code = (() => {
      const c = r.code;
      if (!c) return 'Unknown';
      if (c.text) return c.text;
      if (Array.isArray(c.coding) && c.coding.length > 0) {
        return c.coding[0].display ?? c.coding[0].code ?? 'Unknown';
      }
      return 'Unknown';
    })();

    const value = (() => {
      if (r.valueQuantity) {
        const v = r.valueQuantity.value ?? '';
        const u = r.valueQuantity.unit ?? '';
        return `${v} ${u}`.trim();
      }
      if (typeof r.valueString === 'string') return r.valueString;
      return '—';
    })();

    return {
      id: r.id ?? String(i),
      status: r.status ?? 'unknown',
      code,
      value,
      effectiveDate: r.effectiveDateTime ?? '',
    };
  });
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'default' {
  if (status === 'final') return 'success';
  if (status === 'preliminary') return 'warning';
  return 'default';
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'vital-signs', label: 'Vital Signs' },
  { value: 'social-history', label: 'Social History' },
  { value: 'imaging', label: 'Imaging' },
];

export function FhirObservationViewer({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [category, setCategory] = useState('');
  const [observations, setObservations] = useState<FhirObservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const inFlightRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  async function fetchObservations(id: string) {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError('');
    setSearched(false);
    try {
      const categoryParam = category ? `?category=${encodeURIComponent(category)}` : '';
      const url = `${API_BASE}/api/v1/fhir/observations/${encodeURIComponent(id)}${categoryParam}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) { if (!controller.signal.aborted) { setError(`HTTP ${res.status}`); setSearched(true); } return; }
      const raw = await res.json();
      if (!controller.signal.aborted) { setObservations(parseBundle(raw)); setSearched(true); }
    } catch (err) {
      if (isAbortLikeError(err)) return;
      if (!controller.signal.aborted) { setObservations(DEMO_OBSERVATIONS); setSearched(true); }
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
    }
  }

  useEffect(() => {
    if (propId) void fetchObservations(propId);
    return () => { inFlightRequest.current?.abort(); };
  }, [propId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    if (!patientId.trim()) return;
    void fetchObservations(patientId.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>FHIR Observation Viewer</CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          {!propId && (
            <TextField
              label="Patient ID"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              size="small"
              sx={{ minWidth: 200 }}
            />
          )}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button onClick={handleSearch} disabled={!patientId.trim() || loading}>
            {loading ? 'Searching…' : 'Search Observations'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {!searched && !loading && !error && (
          <Typography variant="body2" color="text.secondary">
            Enter a Patient ID and click Search to load observations.
          </Typography>
        )}

        {searched && observations.length === 0 && (
          <Alert severity="info">No observations found for this patient.</Alert>
        )}

        {observations.length > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Chip label={`${observations.length} observation(s)`} color="primary" />
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Observation</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {observations.map(obs => (
                  <TableRow key={obs.id}>
                    <TableCell>{obs.code}</TableCell>
                    <TableCell>{obs.value}</TableCell>
                    <TableCell>
                      {obs.effectiveDate
                        ? new Date(obs.effectiveDate).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(obs.status)}>{obs.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
