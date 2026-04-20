import { useEffect, useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { AppointmentHistory } from './AppointmentHistory';
import { CareGapSummary } from './CareGapSummary';
import { NotificationInbox } from './NotificationInbox';
import { PriorAuthStatus } from './PriorAuthStatus';
import { PatientRegistrationForm } from './PatientRegistrationForm';
import { AuthStatus } from './AuthStatus';
import { b2cConfigured } from '../auth/msalConfig';
import { useAuthPatientId } from '../hooks/useAuthPatientId';

interface PatientPortalProps {
  /** Initial patient ID — overridden by the authenticated user's ID when B2C is configured. */
  patientId?: string;
}

export function PatientPortal({ patientId: propId = '' }: PatientPortalProps) {
  const { patientId: authPatientId, loading: authLoading, isAuthenticated } = b2cConfigured
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useAuthPatientId()
    : { patientId: null, loading: false, isAuthenticated: false };

  const [inputValue, setInputValue] = useState(propId);
  const [activePatientId, setActivePatientId] = useState(propId);
  const [activeTab, setActiveTab] = useState(0);

  // When the auth hook resolves the patient ID, auto-populate the portal.
  useEffect(() => {
    if (authPatientId) {
      setInputValue(authPatientId);
      setActivePatientId(authPatientId);
    }
  }, [authPatientId]);

  function handleLoad() {
    const trimmed = inputValue.trim();
    if (trimmed) setActivePatientId(trimmed);
  }

  if (authLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200 }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Signing you in…
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={600}>
          Patient Portal
        </Typography>
        {b2cConfigured && <AuthStatus />}
      </Stack>

      {/* Patient selector — hidden when the identity was resolved automatically */}
      {!isAuthenticated && (
        <>
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
        </>
      )}

      {!activePatientId && (
        <Typography color="text.secondary">
          {isAuthenticated
            ? 'Resolving your patient profile…'
            : 'Enter a patient ID above to view their portal.'}
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

