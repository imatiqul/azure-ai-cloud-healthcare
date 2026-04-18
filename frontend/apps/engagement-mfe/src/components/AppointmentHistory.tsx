import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/v1/scheduling/appointments?patientId=${encodeURIComponent(patientId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Appointment[]>;
      })
      .then(setAppointments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load appointments'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Typography color="text.secondary">Loading appointments…</Typography>;
  if (error)   return <Typography color="error">{error}</Typography>;

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
