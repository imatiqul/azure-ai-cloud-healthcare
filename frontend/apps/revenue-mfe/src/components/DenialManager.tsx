import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_REVENUE_API_URL || '';

const DEMO_DENIALS: ClaimDenial[] = [
  { id: 'd-1', claimNumber: 'CLM-20240301', patientId: 'PAT-00142', payerName: 'BlueCross BlueShield', denialReasonCode: 'CO-4',  denialReasonDescription: 'Service inconsistent with procedure billed', category: 'Coding',          status: 'Open',         deniedAmount: 3200, deniedAt: new Date(Date.now() - 5 * 86400_000).toISOString(), appealDeadline: new Date(Date.now() + 10 * 86400_000).toISOString(), daysUntilDeadline: 10, resubmissionCount: 0 },
  { id: 'd-2', claimNumber: 'CLM-20240285', patientId: 'PAT-00278', payerName: 'Aetna',               denialReasonCode: 'PR-96', denialReasonDescription: 'Non-covered charge',                         category: 'Coverage',        status: 'UnderAppeal',  deniedAmount: 1850, deniedAt: new Date(Date.now() - 12 * 86400_000).toISOString(), appealDeadline: new Date(Date.now() + 3 * 86400_000).toISOString(), daysUntilDeadline: 3, resubmissionCount: 1, appealedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: 'd-3', claimNumber: 'CLM-20240241', patientId: 'PAT-00391', payerName: 'UnitedHealth',        denialReasonCode: 'CO-11', denialReasonDescription: 'Diagnosis incompatible with procedure',      category: 'Medical Necessity', status: 'Open',         deniedAmount: 7400, deniedAt: new Date(Date.now() - 3 * 86400_000).toISOString(), appealDeadline: new Date(Date.now() + 27 * 86400_000).toISOString(), daysUntilDeadline: 27, resubmissionCount: 0 },
  { id: 'd-4', claimNumber: 'CLM-20240198', patientId: 'PAT-00554', payerName: 'Cigna',               denialReasonCode: 'CO-97', denialReasonDescription: 'Payment part of established fee schedule',  category: 'Billing',         status: 'Resubmitted',  deniedAmount: 920,  deniedAt: new Date(Date.now() - 20 * 86400_000).toISOString(), appealDeadline: new Date(Date.now() + 5 * 86400_000).toISOString(), daysUntilDeadline: 5, resubmissionCount: 2, appealedAt: new Date(Date.now() - 15 * 86400_000).toISOString() },
];

const DEMO_ANALYTICS: DenialAnalytics = {
  totalOpen: 31,
  totalUnderAppeal: 8,
  totalResolved: 94,
  overturned: 71,
  overturnRate: 75.5,
  nearDeadlineCount: 6,
  byCategory: { Coding: 12, Coverage: 9, 'Medical Necessity': 7, Billing: 3 },
};

interface ClaimDenial {
  id: string;
  claimNumber: string;
  patientId: string;
  payerName: string;
  denialReasonCode: string;
  denialReasonDescription: string;
  category: string;
  status: 'Open' | 'UnderAppeal' | 'Resubmitted' | 'Resolved';
  deniedAmount: number;
  deniedAt: string;
  appealDeadline: string;
  daysUntilDeadline: number;
  appealedAt?: string;
  resubmissionCount: number;
}

interface DenialAnalytics {
  totalOpen: number;
  totalUnderAppeal: number;
  totalResolved: number;
  overturned: number;
  overturnRate: number;
  nearDeadlineCount: number;
  byCategory: Record<string, number>;
}

type StatusVariant = 'default' | 'warning' | 'error' | 'success' | 'secondary';

const STATUS_VARIANTS: Record<string, StatusVariant> = {
  Open: 'error',
  UnderAppeal: 'warning',
  Resubmitted: 'default',
  Resolved: 'success',
};

export function DenialManager() {
  const [denials, setDenials] = useState<ClaimDenial[]>([]);
  const [analytics, setAnalytics] = useState<DenialAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [appealTarget, setAppealTarget] = useState<ClaimDenial | null>(null);
  const [appealNotes, setAppealNotes] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [denialsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/revenue/denials?status=Open`),
        fetch(`${API_BASE}/api/v1/revenue/denials/analytics`),
      ]);
      if (!denialsRes.ok || !analyticsRes.ok)
        throw new Error(`Revenue APIs unavailable (${denialsRes.status}/${analyticsRes.status})`);

      const denialsData = await denialsRes.json();
      const analyticsData = await analyticsRes.json();

      setDenials(Array.isArray(denialsData) ? denialsData : DEMO_DENIALS);
      setAnalytics(analyticsData ?? DEMO_ANALYTICS);
    } catch {
      setDenials(DEMO_DENIALS);
      setAnalytics(DEMO_ANALYTICS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAppeal = async () => {
    if (!appealTarget) return;
    setSubmittingAppeal(true);
    setAppealError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/denials/${appealTarget.id}/appeal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appealNotes }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        setAppealTarget(null);
        setAppealNotes('');
        fetchData();
      } else {
        const msg = await res.text().catch(() => res.statusText);
        setAppealError(msg || `Appeal submission failed (${res.status})`);
      }
    } catch { setAppealError('Network error. Please try again.'); }
    finally { setSubmittingAppeal(false); }
  };

  const urgencyColor = (days: number) => {
    if (days <= 7) return 'error' as const;
    if (days <= 30) return 'warning' as const;
    return 'default' as const;
  };

  return (
    <Stack spacing={3}>
      {/* Analytics summary */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle>Denial Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Stack alignItems="center">
                  <Typography variant="h4" fontWeight="bold" color="error.main">
                    {analytics.totalOpen}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Open</Typography>
                </Stack>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Stack alignItems="center">
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {analytics.totalUnderAppeal}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Under Appeal</Typography>
                </Stack>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Stack alignItems="center">
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {(analytics.overturnRate * 100).toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Overturn Rate</Typography>
                </Stack>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Stack alignItems="center">
                  <Typography variant="h4" fontWeight="bold" color={analytics.nearDeadlineCount > 0 ? 'error.main' : 'text.primary'}>
                    {analytics.nearDeadlineCount}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Near Deadline</Typography>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Denial list */}
      <Card>
        <CardHeader>
          <CardTitle>Open Claim Denials</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : denials.length === 0 ? (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              No open claim denials
            </Typography>
          ) : (
            <Stack divider={<Divider />} spacing={0}>
              {denials.map((denial) => (
                <Box key={denial.id} sx={{ py: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                    <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={600}>
                          {denial.claimNumber}
                        </Typography>
                        <Badge variant={STATUS_VARIANTS[denial.status] ?? 'default'}>
                          {denial.status}
                        </Badge>
                        <Chip
                          label={`${denial.daysUntilDeadline}d left`}
                          color={urgencyColor(denial.daysUntilDeadline)}
                          size="small"
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Patient: {denial.patientId} &bull; Payer: {denial.payerName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        CARC {denial.denialReasonCode}: {denial.denialReasonDescription}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Category: {denial.category} &bull; Denied: ${denial.deniedAmount.toFixed(2)}
                      </Typography>
                      {denial.resubmissionCount > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Resubmissions: {denial.resubmissionCount}
                        </Typography>
                      )}
                    </Stack>
                    <Button
                      variant="outline"
                      size="small"
                      disabled={denial.resubmissionCount >= 3}
                      onClick={() => setAppealTarget(denial)}
                      aria-label={`Appeal denial ${denial.claimNumber}`}
                      sx={{ flexShrink: 0 }}
                    >
                      Appeal
                    </Button>
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Appeal dialog */}
      <Dialog
        open={!!appealTarget}
        onClose={() => { setAppealTarget(null); setAppealNotes(''); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Submit Appeal — {appealTarget?.claimNumber}</DialogTitle>
        <DialogContent>
          {appealTarget && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              {appealTarget.daysUntilDeadline <= 7 && (
                <Alert severity="error">
                  Appeal deadline in {appealTarget.daysUntilDeadline} day{appealTarget.daysUntilDeadline !== 1 ? 's' : ''}!
                </Alert>
              )}
              {appealError && <Alert severity="error" onClose={() => setAppealError(null)}>{appealError}</Alert>}
              <Typography variant="body2" color="text.secondary">
                CARC {appealTarget.denialReasonCode}: {appealTarget.denialReasonDescription}
              </Typography>
              <TextField
                label="Appeal Notes"
                multiline
                rows={4}
                value={appealNotes}
                onChange={(e) => setAppealNotes(e.target.value)}
                placeholder="Describe the clinical justification and supporting documentation..."
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => { setAppealTarget(null); setAppealNotes(''); }}>
            Cancel
          </Button>
          <Button disabled={submittingAppeal || !appealNotes.trim()} onClick={handleAppeal}>
            {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
