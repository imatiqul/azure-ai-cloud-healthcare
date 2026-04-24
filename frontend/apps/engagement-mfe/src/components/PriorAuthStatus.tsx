import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface PriorAuth {
  id: string;
  patientId: string;
  procedure: string;
  status: string;
  insurancePayer?: string;
  requestedAt: string;
  resolvedAt?: string;
  denialReason?: string;
}

const DEMO_PRIOR_AUTHS: PriorAuth[] = [
  {
    id: 'pa-demo-1',
    patientId: 'demo-patient-1',
    procedure: 'MRI Brain with Contrast',
    status: 'Pending',
    insurancePayer: 'BlueCross BlueShield',
    requestedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
  },
  {
    id: 'pa-demo-2',
    patientId: 'demo-patient-1',
    procedure: 'Physical Therapy (12 sessions)',
    status: 'Approved',
    insurancePayer: 'Aetna',
    requestedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
    resolvedAt: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(),
  },
];

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default';

function authStatusVariant(status: string): BadgeVariant {
  switch (status?.toLowerCase()) {
    case 'approved':  return 'success';
    case 'pending':   return 'warning';
    case 'denied':    return 'danger';
    default:          return 'default';
  }
}

interface Props {
  patientId: string;
}

export function PriorAuthStatus({ patientId }: Props) {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/v1/revenue/prior-auths?patientId=${encodeURIComponent(patientId)}`, { signal: AbortSignal.timeout(10_000) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PriorAuth[]>;
      })
      .then(setAuths)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Typography color="text.secondary">Loading prior authorizations…</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  if (auths.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No prior authorization requests found for this patient
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {auths.map((auth) => (
        <Card key={auth.id}>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <span>{auth.procedure}</span>
                <Badge variant={authStatusVariant(auth.status)}>{auth.status}</Badge>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Stack spacing={0.5}>
              {auth.insurancePayer && (
                <Typography variant="body2">
                  <strong>Payer:</strong> {auth.insurancePayer}
                </Typography>
              )}
              <Typography variant="body2">
                <strong>Requested:</strong> {new Date(auth.requestedAt).toLocaleDateString()}
              </Typography>
              {auth.resolvedAt && (
                <Typography variant="body2">
                  <strong>Resolved:</strong> {new Date(auth.resolvedAt).toLocaleDateString()}
                </Typography>
              )}
              {auth.denialReason && (
                <Typography variant="body2" color="error">
                  <strong>Denial reason:</strong> {auth.denialReason}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
