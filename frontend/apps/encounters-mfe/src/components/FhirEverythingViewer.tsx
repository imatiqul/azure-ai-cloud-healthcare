import { useState, useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

const DEMO_GROUPED: Map<string, FhirEntry[]> = new Map([
  ['Encounter', [
    { resourceType: 'Encounter', id: 'enc-demo-001', status: 'in-progress', date: new Date(Date.now() - 2  * 3_600_000).toISOString(), code: { text: 'Ambulatory — Diabetes Follow-up' } },
    { resourceType: 'Encounter', id: 'enc-demo-002', status: 'finished',    date: new Date(Date.now() - 30 * 86_400_000).toISOString(), code: { text: 'Inpatient — Hypertensive Urgency' } },
  ]],
  ['Condition', [
    { resourceType: 'Condition', id: 'cond-demo-001', status: 'active', code: { text: 'Type 2 Diabetes Mellitus', coding: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus' }] } },
    { resourceType: 'Condition', id: 'cond-demo-002', status: 'active', code: { text: 'Essential Hypertension',   coding: [{ code: 'I10',   display: 'Essential (primary) hypertension' }] } },
  ]],
  ['MedicationRequest', [
    { resourceType: 'MedicationRequest', id: 'med-demo-001', status: 'active', code: { text: 'Metformin 1000mg' } },
    { resourceType: 'MedicationRequest', id: 'med-demo-002', status: 'active', code: { text: 'Lisinopril 10mg' } },
    { resourceType: 'MedicationRequest', id: 'med-demo-003', status: 'active', code: { text: 'Atorvastatin 40mg' } },
  ]],
  ['Observation', [
    { resourceType: 'Observation', id: 'obs-demo-001', status: 'final', effectiveDateTime: new Date(Date.now() - 30 * 86_400_000).toISOString(), code: { text: 'HbA1c',          coding: [{ display: 'Hemoglobin A1c' }] } },
    { resourceType: 'Observation', id: 'obs-demo-002', status: 'final', effectiveDateTime: new Date(Date.now() - 14 * 86_400_000).toISOString(), code: { text: 'Blood Pressure', coding: [{ display: 'Blood pressure panel' }] } },
  ]],
]);
const DEMO_TOTAL = [...DEMO_GROUPED.values()].reduce((sum, arr) => sum + arr.length, 0);

const RESOURCE_TYPE_OPTIONS = [
  'Encounter',
  'Observation',
  'Condition',
  'MedicationRequest',
  'CarePlan',
];

interface FhirCoding { display?: string; code?: string }
interface FhirCode { text?: string; coding?: FhirCoding[] }

interface FhirEntry {
  resourceType: string;
  id: string;
  status?: string;
  date?: string;
  effectiveDateTime?: string;
  recordedDate?: string;
  code?: FhirCode;
}

function parseBundle(raw: unknown): Map<string, FhirEntry[]> {
  const result = new Map<string, FhirEntry[]>();
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj['entry'])) return result;
  for (const e of obj['entry'] as unknown[]) {
    const entry = e as Record<string, unknown>;
    const resource = entry['resource'] as Record<string, unknown> | undefined;
    if (!resource || typeof resource !== 'object') continue;
    const rt = (resource['resourceType'] as string) || 'Unknown';
    if (!result.has(rt)) result.set(rt, []);
    result.get(rt)!.push(resource as unknown as FhirEntry);
  }
  return result;
}

function getResourceDate(r: FhirEntry): string {
  const d = r.date ?? r.effectiveDateTime ?? r.recordedDate;
  return d ? new Date(d).toLocaleDateString() : '—';
}

function getResourceLabel(r: FhirEntry): string {
  if (r.code?.text) return r.code.text;
  const c = r.code?.coding?.[0];
  return c?.display ?? c?.code ?? '';
}

export function FhirEverythingViewer({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grouped, setGrouped] = useState<Map<string, FhirEntry[]> | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const inFlightRequest = useRef<AbortController | null>(null);

  const canSearch = patientId.trim() !== '';

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError(null);
    setGrouped(null);
    setTotalCount(0);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('_type', typeFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const url = `${API_BASE}/api/v1/fhir/patients/${encodeURIComponent(patientId.trim())}/$everything${qs}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        if (!controller.signal.aborted) setError('FHIR $everything failed');
        return;
      }
      const data: unknown = await res.json();
      const map = parseBundle(data);
      const count = [...map.values()].reduce((sum, arr) => sum + arr.length, 0);
      if (!controller.signal.aborted) { setGrouped(map); setTotalCount(count); }
    } catch (err) {
      if (isAbortLikeError(err)) return;
      if (!controller.signal.aborted) { setGrouped(DEMO_GROUPED); setTotalCount(DEMO_TOTAL); }
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
    }
  }, [patientId, typeFilter, canSearch]);

  // Auto-load when parent switches patient
  useEffect(() => {
    if (propId && patientId) void handleSearch();
    return () => { inFlightRequest.current?.abort(); };
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardHeader>
        <CardTitle>FHIR Patient Record ($everything)</CardTitle>
      </CardHeader>
      <CardContent>
        <Box display="flex" flexDirection="column" gap={2}>
          {/* ── Filters ── */}
          <Box display="flex" gap={1} flexWrap="wrap">
            {!propId && (
              <TextField
                label="Patient ID"
                size="small"
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                sx={{ flex: 1, minWidth: 180 }}
              />
            )}
            <TextField
              select
              label="Resource Type"
              size="small"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All Types</MenuItem>
              {RESOURCE_TYPE_OPTIONS.map(t => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <Button onClick={handleSearch} disabled={!canSearch || loading}>
              {loading && <CircularProgress size={16} sx={{ mr: 1 }} />}
              Load Full Record
            </Button>
          </Box>

          {/* ── Prompt ── */}
          {!grouped && !loading && !error && (
            <Typography color="text.secondary" variant="body2">
              Enter a patient ID and click "Load Full Record" to retrieve all FHIR clinical data.
            </Typography>
          )}

          {loading && (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress size={28} />
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {/* ── Empty bundle ── */}
          {grouped !== null && totalCount === 0 && (
            <Alert severity="info">No FHIR resources found for this patient.</Alert>
          )}

          {/* ── Results ── */}
          {grouped !== null && totalCount > 0 && (
            <Box>
              <Chip
                label={`${totalCount} resource${totalCount !== 1 ? 's' : ''}`}
                size="small"
                sx={{ mb: 2 }}
              />
              {[...grouped.entries()].map(([resourceType, resources]) => (
                <Box key={resourceType} mb={2}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Typography variant="subtitle2" fontWeight={700}>{resourceType}</Typography>
                    <Chip label={resources.length} size="small" variant="outlined" />
                  </Box>
                  <Divider sx={{ mb: 1 }} />
                  <Box display="flex" flexDirection="column" gap={0.5}>
                    {resources.slice(0, 20).map(r => (
                      <Box
                        key={r.id}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        py={0.75}
                        px={1}
                        borderBottom="1px solid"
                        borderColor="divider"
                      >
                        <Box>
                          <Typography variant="body2" fontFamily="monospace">{r.id}</Typography>
                          {getResourceLabel(r) && (
                            <Typography variant="caption" color="text.secondary">
                              {getResourceLabel(r)}
                            </Typography>
                          )}
                        </Box>
                        <Box display="flex" gap={1} alignItems="center">
                          {r.status && (
                            <Chip label={r.status} size="small" variant="outlined" />
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {getResourceDate(r)}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                    {resources.length > 20 && (
                      <Typography variant="caption" color="text.secondary" sx={{ pl: 1, pt: 0.5 }}>
                        … and {resources.length - 20} more
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
