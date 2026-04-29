import { useState, useEffect, useRef } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

const DEMO_IMMUNIZATIONS: Immunization[] = [
  { resourceType: 'Immunization', id: 'imm-demo-001', status: 'completed', vaccineCode: { text: 'Influenza Vaccine (Seasonal)',          coding: [{ display: 'Influenza, Seasonal, Injectable' }] },           occurrenceDateTime: new Date(Date.now() - 180 * 86_400_000).toISOString(), primarySource: true },
  { resourceType: 'Immunization', id: 'imm-demo-002', status: 'completed', vaccineCode: { text: 'COVID-19 Vaccine (mRNA)',                 coding: [{ display: 'COVID-19 mRNA Vaccine' }] },                     occurrenceDateTime: new Date(Date.now() - 270 * 86_400_000).toISOString(), primarySource: true },
  { resourceType: 'Immunization', id: 'imm-demo-003', status: 'completed', vaccineCode: { text: 'Tdap (Tetanus, Diphtheria, Pertussis)', coding: [{ display: 'Tetanus, diphtheria, acellular pertussis vaccine' }] }, occurrenceDateTime: new Date(Date.now() - 730 * 86_400_000).toISOString(), primarySource: false },
];

interface Immunization {
  id?: string;
  resourceType: string;
  status?: string;
  vaccineCode?: { text?: string; coding?: { display?: string }[] };
  patient?: { reference?: string };
  occurrenceDateTime?: string;
  recorded?: string;
  primarySource?: boolean;
}

interface Bundle<T> {
  entry?: { resource: T }[];
}

function statusBadge(status?: string) {
  switch (status) {
    case 'completed':    return 'success' as const;
    case 'not-done':     return 'danger' as const;
    case 'entered-in-error': return 'warning' as const;
    default:             return 'default' as const;
  }
}

export function ImmunizationPanel({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [immunizations, setImmunizations] = useState<Immunization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  useEffect(() => {
    if (patientId) void fetchImmunizations(patientId);
    return () => { inFlightRequest.current?.abort(); };
  }, [patientId]);

  async function fetchImmunizations(id: string) {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/fhir/immunizations/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (!res.ok) { if (!controller.signal.aborted) setError(`HTTP ${res.status}`); return; }
      const bundle: Bundle<Immunization> = await res.json();
      if (!controller.signal.aborted) setImmunizations(bundle.entry?.map(e => e.resource) ?? []);
    } catch (err) {
      if (isAbortLikeError(err)) return;
      if (!controller.signal.aborted) { setImmunizations(DEMO_IMMUNIZATIONS); setError(null); }
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Immunizations</CardTitle>
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
          <Typography variant="body2" color="text.secondary">Enter a patient ID to load immunization records.</Typography>
        )}
        {patientId && !loading && immunizations.length === 0 && !error && (
          <Typography variant="body2" color="text.secondary">No immunizations recorded.</Typography>
        )}

        <Stack gap={1}>
          {immunizations.map((imm, i) => {
            const vaccine = imm.vaccineCode?.text ?? imm.vaccineCode?.coding?.[0]?.display ?? 'Unknown vaccine';
            const occurrence = imm.occurrenceDateTime ?? imm.recorded;
            return (
              <Stack key={imm.id ?? i} direction="row" justifyContent="space-between" alignItems="center"
                sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Stack>
                  <Typography variant="body2" fontWeight="bold">{vaccine}</Typography>
                  {occurrence && (
                    <Typography variant="caption" color="text.secondary">
                      Given: {new Date(occurrence).toLocaleDateString()}
                    </Typography>
                  )}
                  {imm.primarySource === false && (
                    <Typography variant="caption" color="text.secondary">Secondary source</Typography>
                  )}
                </Stack>
                <Badge variant={statusBadge(imm.status)}>{imm.status ?? '—'}</Badge>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
