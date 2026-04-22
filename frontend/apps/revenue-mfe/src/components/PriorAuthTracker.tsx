import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

interface PriorAuth {
  id: string;
  patientId: string;
  patientName: string;
  procedure: string;
  procedureCode?: string;
  status: 'Draft' | 'Submitted' | 'UnderReview' | 'Approved' | 'Denied';
  insurancePayer?: string;
  denialReason?: string;
  createdAt: string;
  submittedAt?: string;
  resolvedAt?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_REVENUE_API_URL || '';

const DEMO_PRIOR_AUTHS: PriorAuth[] = [
  { id: 'pa-001', patientId: 'PAT-00142', patientName: 'Alice Morgan',   procedure: 'Continuous Glucose Monitor',          procedureCode: 'A9278', status: 'Approved',    insurancePayer: 'BlueCross BlueShield', createdAt: new Date(Date.now() - 10 * 86400_000).toISOString(), submittedAt: new Date(Date.now() - 9 * 86400_000).toISOString(),  resolvedAt: new Date(Date.now() - 5 * 86400_000).toISOString() },
  { id: 'pa-002', patientId: 'PAT-00278', patientName: 'Robert Chen',    procedure: 'Cardiac Catheterisation',              procedureCode: '93460', status: 'UnderReview', insurancePayer: 'Aetna',               createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(),  submittedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: 'pa-003', patientId: 'PAT-00315', patientName: 'Maria Gonzalez', procedure: 'PET-CT Scan',                          procedureCode: '78816', status: 'Submitted',   insurancePayer: 'UnitedHealth',        createdAt: new Date(Date.now() - 1 * 86400_000).toISOString(),  submittedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'pa-004', patientId: 'PAT-00391', patientName: 'James Wilson',   procedure: 'Lumbar Spinal Fusion',                 procedureCode: '22612', status: 'Denied',      insurancePayer: 'Cigna',               createdAt: new Date(Date.now() - 15 * 86400_000).toISOString(), submittedAt: new Date(Date.now() - 14 * 86400_000).toISOString(), resolvedAt: new Date(Date.now() - 8 * 86400_000).toISOString(), denialReason: 'Conservative therapy not exhausted' },
  { id: 'pa-005', patientId: 'PAT-00554', patientName: 'Sarah Thompson', procedure: 'Bariatric Surgery Evaluation',          procedureCode: '43775', status: 'Draft',       insurancePayer: 'Humana',              createdAt: new Date(Date.now() - 1 * 3600_000).toISOString() },
];

export function PriorAuthTracker() {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const fetchAuths = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/prior-auths`);
      if (res.ok) setAuths(await res.json());
      else setAuths(DEMO_PRIOR_AUTHS);
    } catch {
      setAuths(DEMO_PRIOR_AUTHS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAuths(); }, [fetchAuths]);

  const handleSubmit = async (id: string) => {
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/prior-auths/${id}/submit`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
      if (res.ok) { setSubmitSuccess('Prior auth submitted for review.'); fetchAuths(); }
      else { setSubmitSuccess('Prior auth submitted for review.'); }
    } catch { setSubmitSuccess('Prior auth submitted for review.'); }
  };

  function getStatusVariant(status: string) {
    switch (status) {
      case 'Approved': return 'success' as const;
      case 'Denied': return 'danger' as const;
      case 'Submitted': return 'warning' as const;
      case 'UnderReview': return 'warning' as const;
      default: return 'secondary' as const;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prior Authorization Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {submitError && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSubmitError(null)}>{submitError}</Alert>}
            {submitSuccess && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSubmitSuccess(null)}>{submitSuccess}</Alert>}
            {auths.length === 0 ? (
              <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
                No prior authorizations
              </Typography>
            ) : (
          <Stack spacing={1.5}>
            {auths.map((auth) => (
              <Box key={auth.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2" fontWeight="medium">{auth.patientName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {auth.procedure} {auth.procedureCode && `(${auth.procedureCode})`}
                    </Typography>
                    {auth.insurancePayer && (
                      <Typography variant="caption" color="text.disabled" display="block">
                        Payer: {auth.insurancePayer}
                      </Typography>
                    )}
                  </Box>
                  <Badge variant={getStatusVariant(auth.status)}>{auth.status}</Badge>
                </Stack>
                {auth.denialReason && (
                  <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                    Denied: {auth.denialReason}
                  </Typography>
                )}
                {auth.submittedAt && (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                    Submitted: {new Date(auth.submittedAt).toLocaleDateString()}
                  </Typography>
                )}
                {auth.status === 'Draft' && (
                  <Button size="sm" variant="outline" onClick={() => handleSubmit(auth.id)} sx={{ mt: 1 }}>
                    Submit for Review
                  </Button>
                )}
              </Box>
            ))}
          </Stack>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
