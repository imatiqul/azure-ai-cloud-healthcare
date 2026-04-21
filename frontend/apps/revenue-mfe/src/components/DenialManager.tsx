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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [denialsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/revenue/denials?status=Open`),
        fetch(`${API_BASE}/api/v1/revenue/denials/analytics`),
      ]);
      if (denialsRes.ok) setDenials(await denialsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch {
      /* API may not be available yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAppeal = async () => {
    if (!appealTarget) return;
    setSubmittingAppeal(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/denials/${appealTarget.id}/appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: appealNotes }),
      });
      if (res.ok) {
        setAppealTarget(null);
        setAppealNotes('');
        fetchData();
      }
    } catch { /* silent */ }
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
