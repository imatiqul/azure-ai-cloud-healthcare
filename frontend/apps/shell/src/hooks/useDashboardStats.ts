import { useCallback, useEffect, useRef, useState } from 'react';
import { gqlFetch } from '@healthcare/graphql-client';

// ── GQL query ─────────────────────────────────────────────────────────────────

const DASHBOARD_STATS_QUERY = /* GraphQL */ `
  query GetDashboardStats {
    dashboardStats {
      agents {
        pendingTriage
        awaitingReview
        completed
      }
      scheduling {
        availableToday
        bookedToday
      }
      populationHealth {
        highRiskPatients
        totalPatients
        openCareGaps
        closedCareGaps
      }
      revenue {
        codingQueue
        priorAuthsPending
      }
    }
  }
`;

// ── Response shape ────────────────────────────────────────────────────────────

export interface AgentStats {
  pendingTriage: number;
  awaitingReview: number;
  completed: number;
}

export interface SchedulingStats {
  availableToday: number;
  bookedToday: number;
}

export interface PopHealthStats {
  highRiskPatients: number;
  totalPatients: number;
  openCareGaps: number;
  closedCareGaps: number;
}

export interface RevenueStats {
  codingQueue: number;
  priorAuthsPending: number;
}

export interface DashboardStatsResult {
  agents: AgentStats;
  scheduling: SchedulingStats;
  populationHealth: PopHealthStats;
  revenue: RevenueStats;
}

interface GqlResponse {
  dashboardStats: DashboardStatsResult;
}

// ── Fallback (demo data shown when BFF is unreachable) ────────────────────────

const DEMO_STATS: DashboardStatsResult = {
  agents:           { pendingTriage: 8,  awaitingReview: 3,   completed: 47 },
  scheduling:       { availableToday: 23, bookedToday: 41 },
  populationHealth: { highRiskPatients: 127, totalPatients: 1842, openCareGaps: 84, closedCareGaps: 312 },
  revenue:          { codingQueue: 31,  priorAuthsPending: 12 },
};

const EMPTY_STATS: DashboardStatsResult = {
  agents:           { pendingTriage: 0, awaitingReview: 0, completed: 0 },
  scheduling:       { availableToday: 0, bookedToday: 0 },
  populationHealth: { highRiskPatients: 0, totalPatients: 0, openCareGaps: 0, closedCareGaps: 0 },
  revenue:          { codingQueue: 0, priorAuthsPending: 0 },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseDashboardStatsReturn {
  stats: DashboardStatsResult | null;
  loading: boolean;
  error: boolean;
  lastRefreshed: Date | null;
  /** Manually re-fetch. Resets the 30s auto-refresh timer. */
  refetch: () => void;
}

/**
 * Fetches aggregated dashboard statistics from the BFF GraphQL endpoint,
 * replacing four individual REST calls with a single parallel query.
 * Falls back to demo data when the BFF is unreachable (404) or returns no data.
 */
export function useDashboardStats(
  enabled = true,
  refreshIntervalMs = 30_000,
): UseDashboardStatsReturn {
  const [stats, setStats]             = useState<DashboardStatsResult | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    if (!enabled) {
      setStats(DEMO_STATS);
      setError(false);
      setLastRefreshed(new Date());
      setLoading(false);
      return;
    }
    try {
      const data = await gqlFetch<GqlResponse>({ query: DASHBOARD_STATS_QUERY });
      if (data.dashboardStats) {
        setStats(data.dashboardStats);
        setError(false);
      } else {
        // BFF returned null (services not yet deployed) — show demo data
        setStats(DEMO_STATS);
        setError(true);
      }
    } catch {
      // Network error or BFF offline — keep any existing data, show demo on first load
      setStats(prev => prev ?? DEMO_STATS);
      setError(true);
    } finally {
      setLastRefreshed(new Date());
      setLoading(false);
    }
  }, [enabled]);

  // Kick off initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || refreshIntervalMs <= 0) return;
    intervalRef.current = setInterval(fetchStats, refreshIntervalMs);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchStats, enabled, refreshIntervalMs]);

  const refetch = useCallback(() => {
    // Reset the interval timer on manual refresh
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    setLoading(true);
    fetchStats();
    if (enabled && refreshIntervalMs > 0) {
      intervalRef.current = setInterval(fetchStats, refreshIntervalMs);
    }
  }, [fetchStats, enabled, refreshIntervalMs]);

  return { stats, loading, error, lastRefreshed, refetch };
}

export { DEMO_STATS, EMPTY_STATS };
