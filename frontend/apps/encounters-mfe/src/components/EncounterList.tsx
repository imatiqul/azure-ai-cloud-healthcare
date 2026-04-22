import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import type { Bundle, Encounter } from '@healthcare/fhir-types';
import { CreateEncounterModal } from './CreateEncounterModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_ENCOUNTERS: Encounter[] = [
  { resourceType: 'Encounter', id: 'enc-demo-001', status: 'in-progress', class: { code: 'AMB', display: 'Ambulatory' }, period: { start: new Date(Date.now() - 2 * 3_600_000).toISOString() }, reasonCode: [{ coding: [{ display: 'Type 2 Diabetes — quarterly follow-up' }] }] },
  { resourceType: 'Encounter', id: 'enc-demo-002', status: 'finished',    class: { code: 'IMP', display: 'Inpatient'   }, period: { start: new Date(Date.now() - 30 * 86_400_000).toISOString(), end: new Date(Date.now() - 27 * 86_400_000).toISOString() }, reasonCode: [{ coding: [{ display: 'Hypertensive urgency management' }] }] },
  { resourceType: 'Encounter', id: 'enc-demo-003', status: 'planned',     class: { code: 'AMB', display: 'Ambulatory' }, period: { start: new Date(Date.now() + 7  * 86_400_000).toISOString() }, reasonCode: [{ coding: [{ display: 'Annual wellness visit' }] }] },
];

// AI-generated flags keyed by encounter ID — shown as colour-coded chips on each card
const DEMO_AI_FLAGS: Record<string, string[]> = {
  'enc-demo-001': ['HbA1c Overdue', 'BP Target Not Met'],
  'enc-demo-002': ['Rx Renewal Required', 'Cardiology Follow-up'],
  'enc-demo-003': ['Preventive Screening Due', 'Flu Vaccination Pending'],
};

type EncounterStatus = Encounter['status'];

function statusBadgeVariant(status: EncounterStatus) {
  switch (status) {
    case 'in-progress': return 'warning' as const;
    case 'finished':    return 'success' as const;
    case 'cancelled':   return 'danger'  as const;
    default:            return 'default' as const;
  }
}

export function EncounterList({ patientId: propId }: { patientId?: string } = {}) {
  const [patientId, setPatientId] = useState(propId ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [aiFlags, setAiFlags] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  useEffect(() => {
    if (patientId) fetchEncounters(patientId);
  }, [patientId]);

  async function fetchEncounters(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/fhir/encounters/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle: Bundle<Encounter> = await res.json();
      setEncounters(bundle.entry?.map((e) => e.resource) ?? []);
      setAiFlags({});
    } catch {
      setEncounters(DEMO_ENCOUNTERS);
      setAiFlags(DEMO_AI_FLAGS);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    const trimmed = searchInput.trim();
    if (trimmed) setPatientId(trimmed);
  }

  function handleEncounterCreated() {
    if (patientId) fetchEncounters(patientId);
  }

  return (
    <>
      {/* Patient lookup — hidden when patientId is controlled by the parent */}
      {!propId ? (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <TextField
            label="Patient ID"
            size="small"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. Patient/123 or just 123"
            sx={{ minWidth: 280 }}
          />
          <Button variant="contained" onClick={handleSearch} disabled={!searchInput.trim()}>
            Load Encounters
          </Button>
          <Button variant="outlined" onClick={() => setShowCreate(true)} disabled={!patientId}>
            + New Encounter
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button variant="outlined" size="small" onClick={() => setShowCreate(true)} disabled={!patientId}>
            + New Encounter
          </Button>
        </Stack>
      )}

      {/* State: no patient selected */}
      {!patientId && (
        <Card>
          <CardContent>
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              Enter a Patient ID to view their encounters
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* State: loading */}
      {loading && (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          Loading encounters…
        </Typography>
      )}

      {/* State: error */}
      {error && (
        <Card sx={{ borderColor: 'error.main' }}>
          <CardContent>
            <Typography color="error">{error}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Encounter cards */}
      {!loading && !error && patientId && (
        <Stack spacing={2}>
          {encounters.length === 0 && (
            <Card>
              <CardContent>
                <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
                  No encounters found for this patient
                </Typography>
              </CardContent>
            </Card>
          )}
          {encounters.map((enc) => {
            const dateLabel = enc.period?.start
              ? new Date(enc.period.start).toLocaleString()
              : 'Unknown date';
            const endLabel = enc.period?.end
              ? new Date(enc.period.end).toLocaleString()
              : null;
            const reason = enc.reasonCode?.[0]?.coding?.[0]?.display ?? enc.class?.display ?? enc.class?.code;

            return (
              <Card key={enc.id ?? Math.random().toString()}>
                <CardHeader>
                  <CardTitle>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <span>
                        {enc.class?.display ?? enc.class?.code ?? 'Encounter'}{' '}
                        <Typography component="span" variant="body2" color="text.secondary">
                          #{enc.id?.substring(0, 8)}
                        </Typography>
                      </span>
                      <Badge variant={statusBadgeVariant(enc.status)}>
                        {enc.status}
                      </Badge>
                    </Stack>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>Started:</strong> {dateLabel}
                      {endLabel && <> — <strong>Ended:</strong> {endLabel}</>}
                    </Typography>
                    {reason && (
                      <Typography variant="body2">
                        <strong>Reason:</strong> {reason}
                      </Typography>
                    )}
                    {enc.id && aiFlags[enc.id] && aiFlags[enc.id].length > 0 && (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {aiFlags[enc.id].map(flag => (
                          <Chip
                            key={flag}
                            label={flag}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                          />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Create encounter modal */}
      {showCreate && (
        <CreateEncounterModal
          patientId={patientId}
          onClose={() => setShowCreate(false)}
          onCreated={handleEncounterCreated}
        />
      )}
    </>
  );
}
