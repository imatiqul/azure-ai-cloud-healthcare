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
import Chip from '@mui/material/Chip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AppointmentHistory } from './AppointmentHistory';
import { CareGapSummary } from './CareGapSummary';
import { NotificationInbox } from './NotificationInbox';
import { PriorAuthStatus } from './PriorAuthStatus';
import { PatientRegistrationForm } from './PatientRegistrationForm';
import { AuthStatus } from './AuthStatus';
import { b2cConfigured } from '../auth/msalConfig';
import { useAuthPatientId } from '../hooks/useAuthPatientId';

// Demo engagement summary data keyed by patient ID
const DEMO_ENGAGEMENT: Record<string, { name: string; score: number; nextAppt: string; careGaps: number; channel: string }> = {
  'PAT-00142': { name: 'Alice Morgan',   score: 74, nextAppt: 'Tomorrow, 10:00 AM', careGaps: 3, channel: 'SMS' },
  'PAT-00278': { name: 'James Chen',     score: 61, nextAppt: 'In 5 days, 2:30 PM', careGaps: 5, channel: 'Email' },
  'PAT-00315': { name: "Sarah O'Brien",  score: 88, nextAppt: 'In 2 days, 9:00 AM', careGaps: 1, channel: 'Push' },
};

interface PatientPortalProps {
  /** Initial patient ID — overridden by the authenticated user's ID when B2C is configured. */
  patientId?: string;
}

export function PatientPortal({ patientId: propId = 'PAT-00142' }: PatientPortalProps) {
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
          {/* AI Engagement Summary Bar */}
          {DEMO_ENGAGEMENT[activePatientId] && (() => {
            const eng = DEMO_ENGAGEMENT[activePatientId];
            const scoreColor = eng.score >= 80 ? '#16a34a' : eng.score >= 60 ? '#d97706' : '#d32f2f';
            return (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(22,163,74,0.06) 100%)',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  <Typography variant="caption" fontWeight={700} color="primary.main">
                    AI Engagement Summary — {eng.name}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Stack alignItems="center">
                    <Typography variant="h5" fontWeight={800} sx={{ color: scoreColor, lineHeight: 1 }}>
                      {eng.score}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Engagement Score</Typography>
                  </Stack>
                  <Divider orientation="vertical" flexItem />
                  <Stack justifyContent="center">
                    <Typography variant="body2" fontWeight={600}>{eng.nextAppt}</Typography>
                    <Typography variant="caption" color="text.secondary">Next Appointment</Typography>
                  </Stack>
                  <Divider orientation="vertical" flexItem />
                  <Stack justifyContent="center">
                    <Typography variant="body2" fontWeight={600}>{eng.careGaps} open</Typography>
                    <Typography variant="caption" color="text.secondary">Care Gaps</Typography>
                  </Stack>
                  <Divider orientation="vertical" flexItem />
                  <Stack justifyContent="center">
                    <Chip label={eng.channel} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                    <Typography variant="caption" color="text.secondary">Preferred Channel</Typography>
                  </Stack>
                </Stack>
              </Box>
            );
          })()}
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

