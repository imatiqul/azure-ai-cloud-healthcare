import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import type { Bundle, Encounter } from '@healthcare/fhir-types';
import { CreateEncounterModal } from './CreateEncounterModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type EncounterStatus = Encounter['status'];

function statusBadgeVariant(status: EncounterStatus) {
  switch (status) {
    case 'in-progress': return 'warning' as const;
    case 'finished':    return 'success' as const;
    case 'cancelled':   return 'danger'  as const;
    default:            return 'default' as const;
  }
}

export function EncounterList() {
  const [patientId, setPatientId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (patientId) fetchEncounters(patientId);
  }, [patientId]);

  async function fetchEncounters(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/fhir/encounters/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle: Bundle<Encounter> = await res.json();
      setEncounters(bundle.entry?.map((e) => e.resource) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load encounters');
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
      {/* Patient lookup */}
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
        <Button
          variant="outlined"
          onClick={() => setShowCreate(true)}
          disabled={!patientId}
        >
          + New Encounter
        </Button>
      </Stack>

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
