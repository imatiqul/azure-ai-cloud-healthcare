import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface AlertCounts {
  criticalRisk: number;
  activeBreakGlass: number;
  urgentWaitlist: number;
  nearDeadlineDenials: number;
}

async function fetchCount(url: string): Promise<{ count: number; ok: boolean }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { count: 0, ok: false };
    const data = await res.json();
    return { count: Array.isArray(data) ? data.length : 0, ok: true };
  } catch {
    return { count: 0, ok: false };
  }
}

export function ClinicalAlertsSummaryWidget() {
  const [counts, setCounts] = useState<AlertCounts>({
    criticalRisk: 0,
    activeBreakGlass: 0,
    urgentWaitlist: 0,
    nearDeadlineDenials: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [risks, breakGlass, waitlist, denials] = await Promise.all([
        fetchCount(`${API_BASE}/api/v1/population-health/risks?top=20`),
        fetchCount(`${API_BASE}/api/v1/identity/break-glass`),
        fetchCount(`${API_BASE}/api/v1/scheduling/waitlist`),
        fetchCount(`${API_BASE}/api/v1/revenue/denials`),
      ]);
      const anyFailed = [risks, breakGlass, waitlist, denials].some(r => !r.ok);
      setHasError(anyFailed);
      setCounts({ criticalRisk: risks.count, activeBreakGlass: breakGlass.count, urgentWaitlist: waitlist.count, nearDeadlineDenials: denials.count });
      // Persist total for the sidebar alert badge (Phase 53)
      try {
        const total = risks.count + breakGlass.count + waitlist.count + denials.count;
        localStorage.setItem('hq:alerts-count', String(total));
        window.dispatchEvent(new CustomEvent('hq:alerts-updated'));
      } catch { /* ignore */ }
      setLoading(false);
    }
    void load();
  }, []);

  const total = counts.criticalRisk + counts.activeBreakGlass + counts.urgentWaitlist + counts.nearDeadlineDenials;

  const alertItems = [
    { icon: <WarningAmberIcon fontSize="small" />, label: 'High-Risk Patients',  count: counts.criticalRisk,        color: 'error.main' },
    { icon: <LockOpenIcon fontSize="small" />,     label: 'Break-Glass Active',  count: counts.activeBreakGlass,    color: 'warning.main' },
    { icon: <AccessTimeIcon fontSize="small" />,   label: 'Urgent Waitlist',     count: counts.urgentWaitlist,      color: 'warning.main' },
    { icon: <MoneyOffIcon fontSize="small" />,     label: 'Denial Deadlines',    count: counts.nearDeadlineDenials, color: 'error.main' },
  ];

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="subtitle2" fontWeight={700}>
            Clinical Alerts
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" width={28} height={20} />
          ) : (
            <Chip
              label={total}
              size="small"
              color={total > 0 ? 'error' : 'default'}
              sx={{ fontWeight: 700, minWidth: 28 }}
            />
          )}
        </Stack>

        {hasError && (
          <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setHasError(false)}>
            Some alert counts could not be loaded.
          </Alert>
        )}

        <Stack gap={1} divider={<Divider flexItem />}>
          {alertItems.map(item => (
            <Stack
              key={item.label}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box sx={{ color: item.count > 0 ? item.color : 'text.disabled', display: 'flex' }}>
                  {item.icon}
                </Box>
                <Typography variant="caption" color={item.count > 0 ? 'text.primary' : 'text.disabled'}>
                  {item.label}
                </Typography>
              </Stack>
              {loading ? (
                <Skeleton variant="text" width={20} />
              ) : (
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color={item.count > 0 ? item.color : 'text.disabled'}
                >
                  {item.count}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>

        {total > 0 && (
          <Box mt={1.5}>
            <Divider sx={{ mb: 1 }} />
            <Stack
              component={Link}
              to="/alerts"
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{
                textDecoration: 'none',
                color: 'primary.main',
                '&:hover': { color: 'primary.dark' },
              }}
            >
              <Typography variant="caption" fontWeight={600}>
                View All Alerts
              </Typography>
              <ArrowForwardIosIcon sx={{ fontSize: 11 }} />
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
