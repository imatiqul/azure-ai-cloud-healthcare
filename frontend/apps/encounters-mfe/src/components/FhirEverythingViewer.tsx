import { useState, useCallback } from 'react';
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

export function FhirEverythingViewer() {
  const [patientId, setPatientId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grouped, setGrouped] = useState<Map<string, FhirEntry[]> | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const canSearch = patientId.trim() !== '';

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setGrouped(null);
    setTotalCount(0);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('_type', typeFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const url = `${API_BASE}/api/v1/fhir/patients/${encodeURIComponent(patientId.trim())}/$everything${qs}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError(`FHIR $everything failed (HTTP ${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      const map = parseBundle(data);
      const count = [...map.values()].reduce((sum, arr) => sum + arr.length, 0);
      setGrouped(map);
      setTotalCount(count);
    } catch {
      setError('Network error fetching FHIR patient record');
    } finally {
      setLoading(false);
    }
  }, [patientId, typeFilter, canSearch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>FHIR Patient Record ($everything)</CardTitle>
      </CardHeader>
      <CardContent>
        <Box display="flex" flexDirection="column" gap={2}>
          {/* ── Filters ── */}
          <Box display="flex" gap={1} flexWrap="wrap">
            <TextField
              label="Patient ID"
              size="small"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              sx={{ flex: 1, minWidth: 180 }}
            />
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
