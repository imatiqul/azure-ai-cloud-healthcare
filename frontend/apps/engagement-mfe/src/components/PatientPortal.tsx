import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Divider from '@mui/material/Divider';
import { AppointmentHistory } from './AppointmentHistory';
import { CareGapSummary } from './CareGapSummary';
import { NotificationInbox } from './NotificationInbox';
import { PriorAuthStatus } from './PriorAuthStatus';
import { PatientRegistrationForm } from './PatientRegistrationForm';

interface PatientPortalProps {
  /** Initial patient ID — can be overridden via the search field. */
  patientId?: string;
}

export function PatientPortal({ patientId: initialId = '' }: PatientPortalProps) {
  const [inputValue, setInputValue] = useState(initialId);
  const [activePatientId, setActivePatientId] = useState(initialId);
  const [activeTab, setActiveTab] = useState(0);

  function handleLoad() {
    const trimmed = inputValue.trim();
    if (trimmed) setActivePatientId(trimmed);
  }

  return (
    <Stack spacing={3} sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600}>
        Patient Portal
      </Typography>

      {/* Patient selector */}
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          label="Patient ID"
          size="small"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          placeholder="e.g. PAT-001"
          sx={{ minWidth: 240 }}
        />
        <Button variant="contained" onClick={handleLoad} disabled={!inputValue.trim()}>
          Load Patient
        </Button>
      </Stack>

      <Divider />
      <PatientRegistrationForm onRegistered={(id) => { setInputValue(id); setActivePatientId(id); }} />

      {!activePatientId && (
        <Typography color="text.secondary">
          Enter a patient ID above to view their portal.
        </Typography>
      )}

      {activePatientId && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab}
              onChange={(_, v: number) => setActiveTab(v)}
              aria-label="Patient portal sections"
            >
              <Tab label="Appointments" />
              <Tab label="Care Gaps" />
              <Tab label="Notifications" />
              <Tab label="Prior Authorizations" />
            </Tabs>
          </Box>

          {activeTab === 0 && <AppointmentHistory patientId={activePatientId} />}
          {activeTab === 1 && <CareGapSummary patientId={activePatientId} />}
          {activeTab === 2 && <NotificationInbox patientId={activePatientId} />}
          {activeTab === 3 && <PriorAuthStatus patientId={activePatientId} />}
        </>
      )}
    </Stack>
  );
}
