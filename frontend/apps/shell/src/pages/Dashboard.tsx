import { useState, useEffect, useCallback, useMemo } from 'react';
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleSendIcon from '@mui/icons-material/ScheduleSend';
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
import { useGlobalStore } from '../store';
import { useDashboardStats, type DashboardStatsResult } from '../hooks/useDashboardStats';

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

function buildStats(data: DashboardStatsResult): DashboardStats[] {
  const { agents, scheduling, populationHealth: popHealth, revenue } = data;
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

// ── AI Daily Briefing ─────────────────────────────────────────────────────────
interface Insight {
  icon: React.ReactNode;
  text: string;
  href: string;
  severity: 'error' | 'warning' | 'info';
}

function AIDailyBriefing({ stats }: { stats: DashboardStats[] }) {
  const navigate = useNavigate();

  const insights = useMemo((): Insight[] => {
    const pending     = stats.find(s => s.labelKey === 'dashboard.pendingTriage')?.value as number | undefined;
    const highRisk    = stats.find(s => s.labelKey === 'dashboard.highRiskPatients')?.value as number | undefined;
    const codeQueue   = stats.find(s => s.labelKey === 'dashboard.codingQueue')?.value as number | undefined;
    const careGaps    = stats.find(s => s.labelKey === 'dashboard.openCareGaps')?.value as number | undefined;
    const priorAuths  = stats.find(s => s.labelKey === 'dashboard.priorAuthPending')?.value as number | undefined;

    const list: Insight[] = [];
    if ((pending ?? 0) >= 5) list.push({ icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} />, text: `${pending} triage cases need clinical review — ${Math.min((pending as number), 3)} are P1 Immediate.`, href: '/triage', severity: 'error' });
    if ((highRisk ?? 0) >= 100) list.push({ icon: <MonitorHeartIcon sx={{ fontSize: 16 }} />, text: `${highRisk} high-risk patients flagged — ${careGaps ?? 0} open care gaps may drive avoidable readmissions.`, href: '/population-health', severity: 'warning' });
    if ((codeQueue ?? 0) >= 20) list.push({ icon: <ScheduleSendIcon sx={{ fontSize: 16 }} />, text: `${codeQueue} encounters await ICD-10 coding and ${priorAuths ?? 0} prior authorisations are pending submission.`, href: '/revenue', severity: 'info' });
    if (list.length === 0) list.push({ icon: <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />, text: 'All workflows are operating within normal thresholds. No critical actions required right now.', href: '/', severity: 'info' });
    return list.slice(0, 3);
  }, [stats]);

  if (stats.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 3,
        p: 2,
        borderRadius: 2,
        background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(124,58,237,0.06) 100%)',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
        <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" fontWeight={700} color="primary.main">
          AI Daily Briefing
        </Typography>
        <Chip label="Live" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
      </Stack>
      <Stack spacing={1}>
        {insights.map((insight) => (
          <Stack
            key={`${insight.severity}-${insight.href}`}
            direction="row"
            spacing={1}
            alignItems="flex-start"
            sx={{
              cursor: 'pointer',
              p: 1,
              borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => navigate(insight.href)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(insight.href)}
          >
            <Box sx={{ color: insight.severity === 'error' ? 'error.main' : insight.severity === 'warning' ? 'warning.main' : 'info.main', mt: 0.1, flexShrink: 0 }}>
              {insight.icon}
            </Box>
            <Typography variant="body2" color="text.primary" lineHeight={1.4}>
              {insight.text}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

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
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontSize: '0.65rem' }}
              aria-hidden="true"
            >
              View →
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats[]>([]);
  const [visibleSections, setVisibleSections] = useState<DashboardSection[]>(loadVisibleSections); // Phase 37
  const backendOnline = useGlobalStore(s => s.backendOnline);

  // Use GraphQL BFF for a single aggregated dashboard stats query
  const {
    stats: rawStats,
    loading,
    error: fetchError,
    lastRefreshed,
    refetch: loadStats,
  } = useDashboardStats(backendOnline !== false);

  // Allow the user to dismiss the error banner without affecting the hook state
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Rebuild the DashboardStats[] array whenever the raw data changes
  useEffect(() => {
    if (rawStats) {
      setStats(buildStats(rawStats));
    }
  }, [rawStats]);

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
        <Stack direction="row" alignItems="center" spacing={2}>
          {lastRefreshed && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Typography>
          )}
          <DashboardCustomizer onChange={setVisibleSections} />
        </Stack>
      </Stack>
      {fetchError && !errorDismissed && (
        <Alert
          severity="info"
          icon={<ScienceOutlinedIcon />}
          sx={{ mb: 2 }}
          onClose={() => setErrorDismissed(true)}
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
      <AIDailyBriefing stats={stats} />
      <Box mb={3}>
        <DashboardQuickActions />
      </Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 9 }}>
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
                      <Grid size={{ xs: 12, sm: 6, md: 3 }} key={stat.labelKey}>
                        <StatCard stat={stat} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              );
            })}
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <ClinicalAlertsSummaryWidget />
          <ActivityFeedWidget />
          <FavoritePagesWidget />
          <RecentPagesWidget />
        </Grid>
      </Grid>
    </Box>
  );
}
