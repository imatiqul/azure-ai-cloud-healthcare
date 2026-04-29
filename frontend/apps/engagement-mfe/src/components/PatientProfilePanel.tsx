import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

interface PatientProfile {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  fhirPatientId: string | null;
}

const DEMO_PROFILE: PatientProfile = {
  id: 'demo-patient-1',
  externalId: 'EXT-001',
  email: 'demo.patient@healthq.example',
  displayName: 'Demo Patient',
  isActive: true,
  fhirPatientId: 'fhir-demo-001',
};

export function PatientProfilePanel() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRequest = useRef<AbortController | null>(null);

  const fetchProfile = useCallback(async () => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/patients/me`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        if (!controller.signal.aborted) {
          if (res.status === 404) {
            setError('Please complete registration to access your profile.');
          } else {
            setError(`HTTP ${res.status}`);
          }
        }
        return;
      }
      const data: PatientProfile = await res.json();
      if (!controller.signal.aborted) setProfile(data);
    } catch (err) {
      if (isAbortLikeError(err)) return;
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    return () => { inFlightRequest.current?.abort(); };
  }, [fetchProfile]);

  return (
    <Card>
      <CardHeader>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <CardTitle>My Patient Profile</CardTitle>
          <IconButton size="small" onClick={fetchProfile} aria-label="refresh" disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={28} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {profile && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">Display Name</Typography>
              <Typography variant="body1" fontWeight={600}>{profile.displayName}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Email</Typography>
              <Typography variant="body1">{profile.email}</Typography>
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
              <Badge variant={profile.isActive ? 'success' : 'error'}>
                {profile.isActive ? 'Active' : 'Inactive'}
              </Badge>
              {profile.fhirPatientId ? (
                <Chip
                  size="small"
                  label={`FHIR ID: ${profile.fhirPatientId}`}
                  color="success"
                  variant="outlined"
                />
              ) : (
                <Chip
                  size="small"
                  label="FHIR ID Not Linked"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Internal Account ID</Typography>
              <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                {profile.id}
              </Typography>
            </Box>
          </Box>
        )}
        {!loading && !error && !profile && (
          <Typography color="text.secondary" variant="body2">No profile data loaded.</Typography>
        )}
      </CardContent>
    </Card>
  );
}
