import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_ANALYTICS: DeliveryAnalytics = {
  Total: 1247,
  Pending: 89,
  Sent: 234,
  Delivered: 856,
  Failed: 68,
  DeliveryRate: 0.863,
  FailureRate: 0.055,
};

const DEMO_CAMPAIGN_LIST: CampaignSummary[] = [
  { id: 'camp-hba1c-recall-2026', name: 'HbA1c Recall Q2 2026',    type: 'SMS',   status: 'Active',    createdAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'camp-flu-vaccine-2026',  name: 'Flu Vaccine Outreach',    type: 'Email', status: 'Completed', createdAt: new Date(Date.now() - 14 * 86400_000).toISOString() },
  { id: 'camp-appt-reminder',     name: 'Appointment Reminders',   type: 'SMS',   status: 'Active',    createdAt: new Date(Date.now() - 7 * 86400_000).toISOString() },
  { id: 'camp-dm-education',      name: 'Diabetes Self-Management',type: 'Email', status: 'Draft',     createdAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
];

interface DeliveryAnalytics {
  Total: number;
  Pending: number;
  Sent: number;
  Delivered: number;
  Failed: number;
  DeliveryRate: number;
  FailureRate: number;
}

interface CampaignSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
}

const CHART_W = 200;
const CHART_H = 120;
const PAD = 8;

function DonutRing({ delivered, failed, pending }: { delivered: number; failed: number; pending: number }) {
  const total = delivered + failed + pending || 1;
  const cx = CHART_W / 2;
  const cy = CHART_H / 2;
  const r = 44;
  const stroke = 20;
  const circ = 2 * Math.PI * r;

  function arc(value: number, offset: number) {
    return (value / total) * circ;
  }

  const deliveredArc = arc(delivered, 0);
  const failedArc    = arc(failed, 0);
  const pendingArc   = arc(pending, 0);

  const deliveredOffset = 0;
  const failedOffset    = circ - deliveredArc;
  const pendingOffset   = circ - deliveredArc - failedArc;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: CHART_W, height: CHART_H }}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f5f5f5" strokeWidth={stroke} />
        {/* delivered */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#2e7d32"
          strokeWidth={stroke}
          strokeDasharray={`${deliveredArc.toFixed(2)} ${circ.toFixed(2)}`}
          strokeDashoffset={(-circ * deliveredOffset / total + circ / 4).toFixed(2)}
          strokeLinecap="butt"
        />
        {/* failed */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#c62828"
          strokeWidth={stroke}
          strokeDasharray={`${failedArc.toFixed(2)} ${circ.toFixed(2)}`}
          strokeDashoffset={(-(circ * (deliveredOffset + delivered) / total) + circ / 4).toFixed(2)}
          strokeLinecap="butt"
        />
        {/* center rate label */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#212121">
          {Math.round((delivered / total) * 100)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="#757575">
          delivered
        </text>
      </svg>
    </Box>
  );
}

export function DeliveryAnalyticsDashboard() {
  const [analytics, setAnalytics]   = useState<DeliveryAnalytics | null>(null);
  const [campaigns, setCampaigns]   = useState<CampaignSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API_BASE}/api/v1/notifications/analytics/delivery`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${API_BASE}/api/v1/notifications/campaigns`, { signal: AbortSignal.timeout(10_000) }),
    ])
      .then(async ([analyticsRes, campaignsRes]) => {
        if (cancelled) return;
        if (!analyticsRes.ok) throw new Error(`Analytics: HTTP ${analyticsRes.status}`);
        if (!campaignsRes.ok) throw new Error(`Campaigns: HTTP ${campaignsRes.status}`);
        const [a, c] = await Promise.all([
          analyticsRes.json() as Promise<DeliveryAnalytics>,
          campaignsRes.json() as Promise<CampaignSummary[]>,
        ]);
        if (!cancelled) {
          setAnalytics(a);
          setCampaigns(c);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Loading delivery analytics…</Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Stack spacing={2}>
      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Delivery Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics ? (
            <Grid container spacing={2} alignItems="center">
              {/* Donut chart */}
              <Grid size={{ xs: 12, sm: 4 }}>
                <DonutRing
                  delivered={analytics.Delivered}
                  failed={analytics.Failed}
                  pending={analytics.Pending}
                />
              </Grid>

              {/* Stats */}
              <Grid size={{ xs: 12, sm: 8 }}>
                <Grid container spacing={1}>
                  {[
                    { label: 'Total', value: analytics.Total, color: 'text.primary' },
                    { label: 'Delivered', value: analytics.Delivered, color: 'success.main' },
                    { label: 'Failed', value: analytics.Failed, color: 'error.main' },
                    { label: 'Pending', value: analytics.Pending, color: 'warning.main' },
                    { label: 'Sent', value: analytics.Sent, color: 'info.main' },
                  ].map(({ label, value, color }) => (
                    <Grid size={{ xs: 6, sm: 4 }} key={label}>
                      <Box
                        sx={{
                          p: 1.5,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="h5" fontWeight="bold" color={color}>
                          {value}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {label}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        textAlign: 'center',
                        bgcolor: analytics.FailureRate > 10 ? 'error.50' : 'transparent',
                      }}
                    >
                      <Typography
                        variant="h5"
                        fontWeight="bold"
                        color={analytics.FailureRate > 10 ? 'error.main' : 'text.primary'}
                      >
                        {analytics.FailureRate}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Failure Rate
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          ) : (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              No analytics data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Campaigns list */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <span>Outreach Campaigns</span>
              <Typography variant="caption" color="text.secondary">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
              </Typography>
            </Stack>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
              No campaigns yet
            </Typography>
          ) : (
            <Stack spacing={1} divider={<Divider />}>
              {campaigns.map((c) => (
                <Box
                  key={c.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 0.75,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {c.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.type} · {new Date(c.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Chip
                    label={c.status}
                    size="small"
                    color={
                      c.status === 'Active'
                        ? 'success'
                        : c.status === 'Completed'
                        ? 'default'
                        : 'warning'
                    }
                  />
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
