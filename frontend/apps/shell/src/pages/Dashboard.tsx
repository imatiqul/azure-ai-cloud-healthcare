import { useState, useEffect, useCallback } from 'react';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardContent } from '@healthcare/design-system';
import { useTranslation } from 'react-i18next';
import { createGlobalHub } from '@healthcare/signalr-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface DashboardStats {
  labelKey: string;
  value: number | string;
  color: string;
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

async function fetchSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function buildStats(agents: { pendingTriage: number; awaitingReview: number; completed: number },
                    scheduling: { availableToday: number; bookedToday: number },
                    popHealth: { highRiskPatients: number; openCareGaps: number },
                    revenue: { codingQueue: number; priorAuthsPending: number }): DashboardStats[] {
  return [
    { labelKey: 'dashboard.pendingTriage',    value: agents.pendingTriage + agents.awaitingReview, color: 'warning.main' },
    { labelKey: 'dashboard.triageCompleted',  value: agents.completed,                             color: 'success.main' },
    { labelKey: 'dashboard.availableSlots',   value: scheduling.availableToday,                    color: 'primary.main' },
    { labelKey: 'dashboard.bookedToday',      value: scheduling.bookedToday,                       color: 'success.main' },
    { labelKey: 'dashboard.highRiskPatients', value: popHealth.highRiskPatients,                   color: 'error.main'   },
    { labelKey: 'dashboard.openCareGaps',     value: popHealth.openCareGaps,                       color: 'warning.main' },
    { labelKey: 'dashboard.codingQueue',      value: revenue.codingQueue,                          color: 'secondary.main' },
    { labelKey: 'dashboard.priorAuthPending', value: revenue.priorAuthsPending,                    color: 'info.main'    },
  ];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Merge a partial real-time payload from SignalR push
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
    // Initial REST fetch
    async function loadStats() {
      const [agents, scheduling, popHealth, revenue] = await Promise.all([
        fetchSafe('/api/v1/agents/stats',           { pendingTriage: 0, awaitingReview: 0, completed: 0 }),
        fetchSafe('/api/v1/scheduling/stats',        { availableToday: 0, bookedToday: 0 }),
        fetchSafe('/api/v1/population-health/stats', { highRiskPatients: 0, openCareGaps: 0 }),
        fetchSafe('/api/v1/revenue/stats',           { codingQueue: 0, priorAuthsPending: 0 }),
      ]);
      setStats(buildStats(agents, scheduling, popHealth, revenue));
      setLoading(false);
    }
    loadStats();
  }, []);

  useEffect(() => {
    // Subscribe to real-time push updates via SignalR (Web PubSub backed hub)
    const hub = createGlobalHub('');   // auth token injected server-side for anonymous demo
    let started = false;

    const startHub = async () => {
      try {
        await hub.start();
        started = true;
        hub.on('dashboard.stats.updated', (payload: RawDashboardPayload) => {
          applyPushUpdate(payload);
        });
      } catch {
        // SignalR not available in dev — fall back to polling-free static data
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

  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        {t('dashboard.title')}
      </Typography>
      {loading ? (
        <Grid container spacing={3}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
                  <Skeleton variant="text" width="40%" height={48} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={3}>
          {stats.map((stat) => (
            <Grid item xs={12} sm={6} md={3} key={stat.labelKey}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    {t(stat.labelKey)}
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: stat.color }}>
                    {stat.value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
