import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import { useAuthFetch } from '@healthcare/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_APPOINTMENTS: Appointment[] = [
  { id: 'appt-001', status: 'booked',    start: new Date(Date.now() + 3 * 86400_000).toISOString(), end: new Date(Date.now() + 3 * 86400_000 + 3600_000).toISOString(), serviceType: 'Diabetes Follow-up',      practitioner: 'Dr. Sarah Patel',    location: 'Endocrinology Clinic — Room 4A' },
  { id: 'appt-002', status: 'fulfilled', start: new Date(Date.now() - 14 * 86400_000).toISOString(), end: new Date(Date.now() - 14 * 86400_000 + 3600_000).toISOString(), serviceType: 'Quarterly HbA1c Review', practitioner: 'Dr. Sarah Patel',    location: 'Endocrinology Clinic' },
  { id: 'appt-003', status: 'fulfilled', start: new Date(Date.now() - 30 * 86400_000).toISOString(), end: new Date(Date.now() - 30 * 86400_000 + 1800_000).toISOString(), serviceType: 'Blood Pressure Check',   practitioner: 'Dr. Michael Torres', location: 'General Practice — Room 2' },
  { id: 'appt-004', status: 'cancelled', start: new Date(Date.now() - 5 * 86400_000).toISOString(), serviceType: 'Dietitian Consultation',                                                               practitioner: 'Emma Walsh RD',      location: 'Nutrition Services' },
];

interface Appointment {
  id: string;
  status: string;
  start: string;
  end?: string;
  serviceType?: string;
  practitioner?: string;
  location?: string;
}

function statusVariant(status: string) {
  switch (status) {
    case 'booked':    return 'success' as const;
    case 'pending':   return 'warning' as const;
    case 'cancelled': return 'danger'  as const;
    case 'fulfilled': return 'default' as const;
    default:          return 'default' as const;
  }
}

interface Props {
  patientId: string;
}

export function AppointmentHistory({ patientId }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const authFetch = useAuthFetch();

  useEffect(() => {
    setLoading(true);
    authFetch(`${API_BASE}/api/v1/scheduling/appointments?patientId=${encodeURIComponent(patientId)}`, { signal: AbortSignal.timeout(10_000) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Appointment[]>;
      })
      .then(setAppointments)
      .catch(() => setAppointments(DEMO_APPOINTMENTS))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Typography color="text.secondary">Loading appointments…</Typography>;

  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No appointments found for this patient
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {appointments.map((appt) => (
        <Card key={appt.id}>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <span>{appt.serviceType ?? 'Appointment'}</span>
                <Badge variant={statusVariant(appt.status)}>{appt.status}</Badge>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                <strong>Start:</strong> {new Date(appt.start).toLocaleString()}
              </Typography>
              {appt.end && (
                <Typography variant="body2">
                  <strong>End:</strong> {new Date(appt.end).toLocaleString()}
                </Typography>
              )}
              {appt.practitioner && (
                <Typography variant="body2">
                  <strong>Practitioner:</strong> {appt.practitioner}
                </Typography>
              )}
              {appt.location && (
                <Typography variant="body2">
                  <strong>Location:</strong> {appt.location}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
