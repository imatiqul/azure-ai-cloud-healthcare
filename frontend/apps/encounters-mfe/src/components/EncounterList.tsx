import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import { gqlFetch } from '@healthcare/graphql-client';
import { CreateEncounterModal } from './CreateEncounterModal';

const GET_ENCOUNTERS = /* GraphQL */ `
  query GetEncounters($patientId: String) {
    encounters(patientId: $patientId) {
      id
      patientId
      patientName
      status
      encounterType
      reasonText
      startedAt
      endedAt
    }
  }
`;

interface EncounterItem {
  id:            string;
  patientId:     string;
  patientName?:  string;
  status:        string;
  encounterType: string;
  reasonText?:   string;
  startedAt:     string;
  endedAt?:      string;
}

const DEMO_ENCOUNTERS: EncounterItem[] = [
  { id: 'enc-demo-001', patientId: 'demo-patient', status: 'in-progress', encounterType: 'Ambulatory',  reasonText: 'Type 2 Diabetes — quarterly follow-up',  startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  { id: 'enc-demo-002', patientId: 'demo-patient', status: 'finished',    encounterType: 'Inpatient',   reasonText: 'Hypertensive urgency management',         startedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), endedAt: new Date(Date.now() - 27 * 86_400_000).toISOString() },
  { id: 'enc-demo-003', patientId: 'demo-patient', status: 'planned',     encounterType: 'Ambulatory',  reasonText: 'Annual wellness visit',                   startedAt: new Date(Date.now() + 7  * 86_400_000).toISOString() },
];

// AI-generated flags keyed by encounter ID — shown as colour-coded chips on each card
const DEMO_AI_FLAGS: Record<string, string[]> = {
  'enc-demo-001': ['HbA1c Overdue', 'BP Target Not Met'],
  'enc-demo-002': ['Rx Renewal Required', 'Cardiology Follow-up'],
  'enc-demo-003': ['Preventive Screening Due', 'Flu Vaccination Pending'],
};

function statusBadgeVariant(status: string) {
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
  const [encounters, setEncounters] = useState<EncounterItem[]>([]);
  const [aiFlags, setAiFlags] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (propId !== undefined) setPatientId(propId);
  }, [propId]);

  const fetchEncounters = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await gqlFetch<{ encounters: EncounterItem[] }>(
        { query: GET_ENCOUNTERS, variables: { patientId: id } },
      );
      setEncounters(data.encounters ?? []);
      setAiFlags({});
    } catch {
      setEncounters(DEMO_ENCOUNTERS);
      setAiFlags(DEMO_AI_FLAGS);
      setError('Failed to load encounters — showing demo data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (patientId) fetchEncounters(patientId);
  }, [patientId, fetchEncounters]);

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
          {/* Type and status filter chips */}
          {encounters.length > 0 && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <Typography variant="caption" color="text.secondary">Type:</Typography>
                {['Ambulatory', 'Inpatient', 'Virtual'].map(t => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    variant={typeFilter === t ? 'filled' : 'outlined'}
                    color={typeFilter === t ? 'primary' : 'default'}
                    onClick={() => setTypeFilter(prev => prev === t ? '' : t)}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <Typography variant="caption" color="text.secondary">Status:</Typography>
                {['in-progress', 'finished', 'planned', 'cancelled'].map(s => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    variant={statusFilter === s ? 'filled' : 'outlined'}
                    color={statusFilter === s ? 'primary' : 'default'}
                    onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                  />
                ))}
              </Stack>
            </Stack>
          )}
          {encounters
            .filter(enc => (!typeFilter || enc.encounterType === typeFilter) && (!statusFilter || enc.status === statusFilter))
            .map((enc) => {
            const dateLabel = enc.startedAt
              ? new Date(enc.startedAt).toLocaleString()
              : 'Unknown date';
            const endLabel = enc.endedAt
              ? new Date(enc.endedAt).toLocaleString()
              : null;
            const reason = enc.reasonText ?? enc.encounterType;

            return (
              <Card key={enc.id ?? Math.random().toString()}>
                <CardHeader>
                  <CardTitle>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <span>
                        {enc.encounterType}{' '}
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
          {encounters.filter(enc => (!typeFilter || enc.encounterType === typeFilter) && (!statusFilter || enc.status === statusFilter)).length === 0 && (
            <Card>
              <CardContent>
                <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
                  {encounters.length === 0 ? 'No encounters found for this patient' : 'No encounters match the selected filters'}
                </Typography>
              </CardContent>
            </Card>
          )}
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
