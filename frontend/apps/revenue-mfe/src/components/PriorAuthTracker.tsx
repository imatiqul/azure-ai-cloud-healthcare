import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
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

export function PriorAuthTracker() {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuths = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/prior-auths`);
      if (res.ok) setAuths(await res.json());
    } catch {
      /* API may not be available yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAuths(); }, [fetchAuths]);

  const handleSubmit = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/prior-auths/${id}/submit`, { method: 'POST' });
      if (res.ok) fetchAuths();
    } catch { /* silent */ }
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
        ) : auths.length === 0 ? (
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
      </CardContent>
    </Card>
  );
}
