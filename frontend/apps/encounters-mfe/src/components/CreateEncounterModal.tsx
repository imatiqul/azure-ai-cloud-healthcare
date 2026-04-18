import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Encounter } from '@healthcare/fhir-types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface Props {
  patientId: string;
  onClose: () => void;
  onCreated: () => void;
}

type EncounterStatus = Encounter['status'];
type EncounterClassCode = 'AMB' | 'IMP' | 'EMER' | 'VR';

const CLASS_OPTIONS: Array<{ code: EncounterClassCode; display: string }> = [
  { code: 'AMB', display: 'Ambulatory' },
  { code: 'IMP', display: 'Inpatient' },
  { code: 'EMER', display: 'Emergency' },
  { code: 'VR', display: 'Virtual' },
];

const STATUS_OPTIONS: EncounterStatus[] = ['planned', 'arrived', 'triaged', 'in-progress', 'finished'];

export function CreateEncounterModal({ patientId, onClose, onCreated }: Props) {
  const [status, setStatus] = useState<EncounterStatus>('in-progress');
  const [classCode, setClassCode] = useState<EncounterClassCode>('AMB');
  const [reasonDisplay, setReasonDisplay] = useState('');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    // Normalise patient reference
    const subjectRef = patientId.startsWith('Patient/')
      ? patientId
      : `Patient/${patientId}`;

    const payload: Partial<Encounter> & { resourceType: 'Encounter' } = {
      resourceType: 'Encounter',
      status,
      class: {
        code: classCode,
        display: CLASS_OPTIONS.find((c) => c.code === classCode)?.display ?? classCode,
      },
      subject: { reference: subjectRef },
      period: { start: new Date(start).toISOString() },
      ...(reasonDisplay.trim() && {
        reasonCode: [
          {
            coding: [{ display: reasonDisplay.trim() }],
          },
        ],
      }),
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/fhir/encounters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create encounter');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Clinical Encounter</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}

          <TextField
            label="Patient ID"
            value={patientId}
            InputProps={{ readOnly: true }}
            size="small"
          />

          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as EncounterStatus)}
            size="small"
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Class"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value as EncounterClassCode)}
            size="small"
          >
            {CLASS_OPTIONS.map((c) => (
              <MenuItem key={c.code} value={c.code}>
                {c.display}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Start Date/Time"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="Reason (optional)"
            value={reasonDisplay}
            onChange={(e) => setReasonDisplay(e.target.value)}
            size="small"
            placeholder="e.g. Annual wellness visit"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Create Encounter'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
