import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import GapAnalysisIcon from '@mui/icons-material/Analytics';
import CodeIcon from '@mui/icons-material/Code';
import GavelIcon from '@mui/icons-material/Gavel';
import { Card, CardContent, SkeletonStatGrid } from '@healthcare/design-system';
import Alert from '@mui/material/Alert';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useTranslation } from 'react-i18next';
import { createGlobalHub } from '@healthcare/signalr-client';
import { WelcomeCard } from '../components/WelcomeCard';
import { RecentPagesWidget } from '../components/RecentPagesWidget'; // Phase 35
import { FavoritePagesWidget } from '../components/FavoritePagesWidget'; // Phase 36
import { DashboardCustomizer, loadVisibleSections, type DashboardSection } from '../components/DashboardCustomizer'; // Phase 37
import { ClinicalAlertsSummaryWidget } from '../components/ClinicalAlertsSummaryWidget'; // Phase 41
import { DashboardQuickActions } from '../components/DashboardQuickActions'; // Phase 47
import { ActivityFeedWidget } from '../components/ActivityFeedWidget'; // Phase 53

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
// Only attempt SignalR when the hub URL is explicitly configured.
// Leaving VITE_SIGNALR_HUB_URL empty disables the feature gracefully (no 405 errors).
const SIGNALR_HUB_URL = import.meta.env.VITE_SIGNALR_HUB_URL || '';

interface DashboardStats {
  labelKey:  string;
  value:     number | string;
  color:     string;
  icon:      React.ReactNode;
  section:   'clinical' | 'scheduling' | 'population' | 'revenue';
  trend?:    number; // positive = up, negative = down
  href:      string;
}

interface RawDashboardPayload {
  pendingTriage?: number;
  awaitingReview?: number;
  completed?: number;
  availableToday?: number;
  bookedToday?: number;
  highRiskPatients?: number;
  openCareGaps?: number;
  codingQueue?: number;
  priorAuthsPending?: number;
}

// Realistic demo data shown when the backend is not yet reachable
const DEMO_AGENTS     = { pendingTriage: 8,   awaitingReview: 3,  completed: 47 };
const DEMO_SCHEDULING = { availableToday: 23, bookedToday: 41 };
const DEMO_POPHEALTH  = { highRiskPatients: 127, openCareGaps: 84 };
const DEMO_REVENUE    = { codingQueue: 31, priorAuthsPending: 12 };

async function fetchSafe<T>(url: string, demo: T, fallback: T, failedUrls?: string[]): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      failedUrls?.push(url);
      // 404 = backend not deployed → show realistic demo data instead of zeros
      return res.status === 404 ? demo : fallback;
    }
    return await res.json();
  } catch {
    failedUrls?.push(url);
    return fallback;
  }
}

function buildStats(
  agents:     { pendingTriage: number; awaitingReview: number; completed: number },
  scheduling: { availableToday: number; bookedToday: number },
  popHealth:  { highRiskPatients: number; openCareGaps: number },
  revenue:    { codingQueue: number; priorAuthsPending: number }
): DashboardStats[] {
  return [
    { labelKey: 'dashboard.pendingTriage',    value: agents.pendingTriage + agents.awaitingReview, color: 'warning.main',   icon: <WarningAmberIcon />,         section: 'clinical',    trend: -5,  href: '/triage'           },
    { labelKey: 'dashboard.triageCompleted',  value: agents.completed,                             color: 'success.main',   icon: <CheckCircleOutlineIcon />,   section: 'clinical',    trend: 12,  href: '/triage'           },
    { labelKey: 'dashboard.availableSlots',   value: scheduling.availableToday,                    color: 'primary.main',   icon: <CalendarTodayIcon />,        section: 'scheduling',  trend: 0,   href: '/scheduling'       },
    { labelKey: 'dashboard.bookedToday',      value: scheduling.bookedToday,                       color: 'success.main',   icon: <EventAvailableIcon />,       section: 'scheduling',  trend: 8,   href: '/scheduling'       },
    { labelKey: 'dashboard.highRiskPatients', value: popHealth.highRiskPatients,                   color: 'error.main',     icon: <MonitorHeartIcon />,         section: 'population',  trend: 2,   href: '/population-health'},
    { labelKey: 'dashboard.openCareGaps',     value: popHealth.openCareGaps,                       color: 'warning.main',   icon: <GapAnalysisIcon />,          section: 'population',  trend: -3,  href: '/population-health'},
    { labelKey: 'dashboard.codingQueue',      value: revenue.codingQueue,                          color: 'secondary.main', icon: <CodeIcon />,                 section: 'revenue',     trend: 15,  href: '/revenue'          },
    { labelKey: 'dashboard.priorAuthPending', value: revenue.priorAuthsPending,                    color: 'info.main',      icon: <GavelIcon />,                section: 'revenue',     trend: -7,  href: '/revenue'          },
  ];
}

const sectionMeta: Record<string, { label: string; color: string }> = {
  clinical:   { label: 'Clinical',          color: '#2563eb' },
  scheduling: { label: 'Scheduling',        color: '#16a34a' },
  population: { label: 'Population Health', color: '#d97706' },
  revenue:    { label: 'Revenue Cycle',     color: '#7c3aed' },
};

const sections = ['clinical', 'scheduling', 'population', 'revenue'] as const;

function TrendBadge({ trend }: { trend: number }) {
  if (trend === 0) return null;
  const up   = trend > 0;
  const icon = up ? <TrendingUpIcon sx={{ fontSize: 12 }} /> : <TrendingDownIcon sx={{ fontSize: 12 }} />;
  return (
    <Chip
      size="small"
      icon={icon}
      label={`${Math.abs(trend)}%`}
      sx={{
        height: 20,
        fontSize: '0.65rem',
        fontWeight: 600,
        bgcolor: up ? 'success.light' : 'error.light',
        color: up ? 'success.dark' : 'error.dark',
        '& .MuiChip-icon': { color: 'inherit', ml: '4px', mr: '-4px' },
        '& .MuiChip-label': { px: '6px' },
      }}
    />
  );
}

function StatCard({ stat }: { stat: DashboardStats }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card
      interactive
      sx={{ height: '100%', cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s', '&:hover': { transform: 'translateY(-2px)' } }}
      onClick={() => navigate(stat.href)}
      role="link"
      aria-label={`${t(stat.labelKey)}: ${stat.value} — navigate to ${stat.href}`}
    >
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={1.5}>
          <Typography variant="body2" color="text.secondary" fontWeight={500} lineHeight={1.3}>
            {t(stat.labelKey)}
          </Typography>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: stat.color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              flexShrink: 0,
              '& svg': { fontSize: 18 },
            }}
          >
            {stat.icon}
          </Box>
        </Stack>
        <Typography variant="h3" fontWeight={700} sx={{ color: stat.color, lineHeight: 1 }}>
          {stat.value}
        </Typography>
        {stat.trend !== undefined && (
          <Box mt={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <TrendBadge trend={stat.trend} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Go →</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [visibleSections, setVisibleSections] = useState<DashboardSection[]>(loadVisibleSections); // Phase 37

  const applyPushUpdate = useCallback((payload: RawDashboardPayload) => {
    setStats(prev => prev.map(s => {
      switch (s.labelKey) {
        case 'dashboard.pendingTriage':    return payload.pendingTriage    !== undefined ? { ...s, value: (payload.pendingTriage ?? 0) + (payload.awaitingReview ?? 0) } : s;
        case 'dashboard.triageCompleted': return payload.completed         !== undefined ? { ...s, value: payload.completed }         : s;
        case 'dashboard.availableSlots':  return payload.availableToday    !== undefined ? { ...s, value: payload.availableToday }    : s;
        case 'dashboard.bookedToday':     return payload.bookedToday       !== undefined ? { ...s, value: payload.bookedToday }       : s;
        case 'dashboard.highRiskPatients':return payload.highRiskPatients  !== undefined ? { ...s, value: payload.highRiskPatients }  : s;
        case 'dashboard.openCareGaps':    return payload.openCareGaps      !== undefined ? { ...s, value: payload.openCareGaps }      : s;
        case 'dashboard.codingQueue':     return payload.codingQueue       !== undefined ? { ...s, value: payload.codingQueue }       : s;
        case 'dashboard.priorAuthPending':return payload.priorAuthsPending !== undefined ? { ...s, value: payload.priorAuthsPending } : s;
        default:                          return s;
      }
    }));
  }, []);

  useEffect(() => {
    async function loadStats() {
      const failed: string[] = [];
      const [agents, scheduling, popHealth, revenue] = await Promise.all([
        fetchSafe('/api/v1/agents/stats',           DEMO_AGENTS,     { pendingTriage: 0, awaitingReview: 0, completed: 0 }, failed),
        fetchSafe('/api/v1/scheduling/stats',        DEMO_SCHEDULING, { availableToday: 0, bookedToday: 0 }, failed),
        fetchSafe('/api/v1/population-health/stats', DEMO_POPHEALTH,  { highRiskPatients: 0, openCareGaps: 0 }, failed),
        fetchSafe('/api/v1/revenue/stats',           DEMO_REVENUE,    { codingQueue: 0, priorAuthsPending: 0 }, failed),
      ]);
      setStats(buildStats(agents, scheduling, popHealth, revenue));
      setFetchError(failed.length > 0);
      setLoading(false);
    }
    loadStats();
  }, []);

  useEffect(() => {
    if (!SIGNALR_HUB_URL) return; // skip when hub not configured — avoids 405 console errors
    const hub = createGlobalHub('', SIGNALR_HUB_URL);
    let started = false;

    const startHub = async () => {
      try {
        await hub.start();
        started = true;
        hub.on('dashboard.stats.updated', (payload: RawDashboardPayload) => {
          applyPushUpdate(payload);
        });
      } catch {
        // SignalR not available in dev
      }
    };

    startHub();

    return () => {
      if (started) {
        hub.off('dashboard.stats.updated');
        hub.stop().catch(() => {});
      }
    };
  }, [applyPushUpdate]);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
          <Typography variant="h5" fontWeight={700}>{t('dashboard.title', 'Dashboard')}</Typography>
          <DashboardCustomizer onChange={setVisibleSections} />
        </Stack>
        <SkeletonStatGrid count={8} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>{t('dashboard.title', 'Dashboard')}</Typography>
        <DashboardCustomizer onChange={setVisibleSections} />
      </Stack>
      {fetchError && (
        <Alert
          severity="info"
          icon={<ScienceOutlinedIcon />}
          sx={{ mb: 2 }}
          onClose={() => setFetchError(false)}
          action={
            <Chip
              label="Demo Mode"
              size="small"
              color="info"
              variant="outlined"
              sx={{ fontWeight: 700, mr: 1 }}
            />
          }
        >
          Backend services are not yet reachable — showing sample data for preview.
        </Alert>
      )}
      <WelcomeCard />
      <Box mb={3}>
        <DashboardQuickActions />
      </Box>
      <Grid container spacing={3}>
        <Grid item xs={12} md={9}>
          <Stack spacing={4}>
            {sections.map((section) => {
              if (!visibleSections.includes(section)) return null;
              const sectionStats = stats.filter(s => s.section === section);
              const meta = sectionMeta[section];
              return (
                <Box key={section}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                    <Box sx={{ width: 3, height: 18, borderRadius: 2, bgcolor: meta.color }} />
                    <Typography variant="overline" fontWeight={700} color="text.secondary" sx={{ letterSpacing: '0.08em', lineHeight: 1 }}>
                      {meta.label}
                    </Typography>
                  </Stack>
                  <Grid container spacing={2}>
                    {sectionStats.map((stat) => (
                      <Grid item xs={12} sm={6} md={3} key={stat.labelKey}>
                        <StatCard stat={stat} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              );
            })}
          </Stack>
        </Grid>
        <Grid item xs={12} md={3}>
          <ClinicalAlertsSummaryWidget />
          <ActivityFeedWidget />
          <FavoritePagesWidget />
          <RecentPagesWidget />
        </Grid>
      </Grid>
    </Box>
  );
}
