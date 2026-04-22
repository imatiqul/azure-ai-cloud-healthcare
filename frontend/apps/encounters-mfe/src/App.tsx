import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import PersonIcon from '@mui/icons-material/Person';
import { EncounterList } from './components/EncounterList';
import { MedicationPanel } from './components/MedicationPanel';
import { AllergyPanel } from './components/AllergyPanel';
import { ProblemListPanel } from './components/ProblemListPanel';
import { ImmunizationPanel } from './components/ImmunizationPanel';

const DEMO_PATIENTS = [
  { id: 'PAT-00142', label: 'PAT-00142 · Diabetes / HTN' },
  { id: 'PAT-00278', label: 'PAT-00278 · Cardiac' },
  { id: 'PAT-00315', label: 'PAT-00315 · Oncology' },
];

export default function App() {
  const [patientId, setPatientId] = useState(DEMO_PATIENTS[0].id);
  const [searchInput, setSearchInput] = useState(DEMO_PATIENTS[0].id);

  function handleSearch() {
    const trimmed = searchInput.trim();
    if (trimmed) setPatientId(trimmed);
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Clinical Encounters
      </Typography>

      {/* ── Shared Patient Context Bar ── */}
      <Stack
        direction="row" spacing={2} alignItems="center" flexWrap="wrap" mb={3}
        sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}
      >
        <PersonIcon color="action" />
        <TextField
          label="Patient ID"
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="e.g. PAT-00142"
          sx={{ minWidth: 220 }}
        />
        <Button variant="contained" size="small" onClick={handleSearch} disabled={!searchInput.trim()}>
          Load
        </Button>
        <Divider orientation="vertical" flexItem />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Quick select:
        </Typography>
        {DEMO_PATIENTS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            size="small"
            onClick={() => { setSearchInput(p.id); setPatientId(p.id); }}
            color={patientId === p.id ? 'primary' : 'default'}
            variant={patientId === p.id ? 'filled' : 'outlined'}
          />
        ))}
      </Stack>

      <EncounterList patientId={patientId} />

      <Divider sx={{ my: 3 }} />

      <Stack gap={3}>
        <MedicationPanel patientId={patientId} />
        <AllergyPanel patientId={patientId} />
        <ProblemListPanel patientId={patientId} />
        <ImmunizationPanel patientId={patientId} />
      </Stack>
    </Box>
  );
}
