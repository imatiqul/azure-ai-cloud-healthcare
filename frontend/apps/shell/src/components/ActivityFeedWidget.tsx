/**
 * ActivityFeedWidget — Phase 53
 *
 * Real-time clinical activity timeline shown on the dashboard right column.
 * Fetches recent events from four APIs (population-health risks, agent triage
 * stats, scheduling appointments, revenue denials) and presents them as a
 * colour-coded chronological feed with deep-links to the relevant pages.
 * Refreshes on demand via the Refresh icon button.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import RefreshIcon from '@mui/icons-material/Refresh';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import { Card, CardContent } from '@healthcare/design-system';
import { useGlobalStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const MAX_ITEMS = 8;

// ── Demo feed (shown when all backend sources are offline) ───────────────────
const now = Date.now();
const DEMO_FEED_EVENTS: ActivityEvent[] = [
  { id: 'd-risk-1',  type: 'risk',        title: 'High risk patient flagged',              detail: 'PAT-00142 — Diabetes + Hypertension comorbidity',         timestamp: new Date(now -  4 * 60_000).toISOString(), href: '/population-health' },
  { id: 'd-tri-1',  type: 'triage',      title: '3 triage cases pending AI review',       detail: '2× P1 Immediate — cardiac symptoms; 1× P2 Urgent',          timestamp: new Date(now -  8 * 60_000).toISOString(), href: '/triage' },
  { id: 'd-appt-1', type: 'appointment', title: 'Appointment booked',                     detail: 'PAT-00278 — Dr. Sarah Chen (Cardiology)',                 timestamp: new Date(now - 15 * 60_000).toISOString(), href: '/scheduling' },
  { id: 'd-risk-2', type: 'risk',        title: 'Risk trajectory updated',                detail: 'PAT-00315 — ML readmission risk: 68% (↑ from 52%)',        timestamp: new Date(now - 22 * 60_000).toISOString(), href: '/population-health' },
  { id: 'd-den-1',  type: 'denial',      title: 'Claim denial — appeal window closing',   detail: 'CLM-4892 — BlueCross — deadline in 2 days',                timestamp: new Date(now - 31 * 60_000).toISOString(), href: '/revenue' },
  { id: 'd-tri-2',  type: 'triage',      title: 'P1 case approved by clinician',          detail: 'demo-wf-1 — Acute chest pain resolved in ED',             timestamp: new Date(now - 47 * 60_000).toISOString(), href: '/triage' },
  { id: 'd-appt-2', type: 'appointment', title: 'Appointment booked',                     detail: 'PAT-00142 — Dr. Emily Watson (Endocrinology)',            timestamp: new Date(now - 62 * 60_000).toISOString(), href: '/scheduling' },
  { id: 'd-den-2',  type: 'denial',      title: '5 claims pending AI coding review',      detail: 'Revenue queue — ICD-10 validation required',               timestamp: new Date(now - 90 * 60_000).toISOString(), href: '/revenue' },
];

// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'risk' | 'triage' | 'appointment' | 'denial';

interface ActivityEvent {
  id:        string;
  type:      EventType;
  title:     string;
  detail:    string;
  timestamp: string;
  href:      string;
}

// ── Meta per event type ───────────────────────────────────────────────────────

const EVENT_META: Record<EventType, { icon: React.ReactNode; color: string; chipLabel: string }> = {
  risk:        { icon: <MonitorHeartIcon  sx={{ fontSize: 14 }} />, color: 'error.main',     chipLabel: 'Risk'       },
  triage:      { icon: <SmartToyIcon     sx={{ fontSize: 14 }} />, color: 'warning.main',   chipLabel: 'Triage'     },
  appointment: { icon: <CalendarMonthIcon sx={{ fontSize: 14 }} />, color: 'primary.main',  chipLabel: 'Scheduling' },
  denial:      { icon: <MoneyOffIcon     sx={{ fontSize: 14 }} />, color: 'secondary.main', chipLabel: 'Revenue'    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function fetchSafe<T>(url: string, fallback: T, signal: AbortSignal, failedSources?: string[], sourceName?: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`, { signal });
    if (!res.ok) { if (failedSources && sourceName) failedSources.push(sourceName); return fallback; }
    return res.json() as Promise<T>;
  } catch (error) {
    if (isAbortLikeError(error) || signal.aborted) {
      throw error;
    }
    if (failedSources && sourceName) failedSources.push(sourceName);
    return fallback;
  }
}

async function buildFeed(signal: AbortSignal): Promise<{ events: ActivityEvent[]; failedSources: string[] }> {
  const failedSources: string[] = [];
  const [risks, triage, appointments, denials] = await Promise.all([
    fetchSafe<Array<{ patientId: string; riskLevel: string; assessedAt?: string }>>(
      '/api/v1/population-health/risks?top=5', [], signal, failedSources, 'Population Health'),
    fetchSafe<{ pendingTriage?: number; awaitingReview?: number; completed?: number }>(
      '/api/v1/agents/stats', {}, signal, failedSources, 'Triage'),
    fetchSafe<Array<{ id: string; patientId?: string; bookedAt?: string }>>(
      '/api/v1/scheduling/bookings?top=5', [], signal, failedSources, 'Scheduling'),
    fetchSafe<Array<{ id: string; claimNumber: string; payerName: string; appealDeadline?: string; denialStatus?: string }>>(
      '/api/v1/revenue/denials?top=5', [], signal, failedSources, 'Revenue'),
  ]);

  const events: ActivityEvent[] = [];

  // Risk assessments — up to 3 items
  if (Array.isArray(risks)) {
    risks.slice(0, 3).forEach((r, i) => {
      events.push({
        id:        `risk-${i}`,
        type:      'risk',
        title:     'Patient risk assessed',
        detail:    `${r.riskLevel} risk — ${r.patientId.slice(0, 8)}…`,
        timestamp: r.assessedAt ?? new Date(Date.now() - i * 900_000).toISOString(),
        href:      '/population-health',
      });
    });
  }

  // Triage queue summary — 1 synthetic item
  const pending = (triage as { pendingTriage?: number }).pendingTriage;
  if (pending !== undefined) {
    events.push({
      id:        'triage-summary',
      type:      'triage',
      title:     `${pending} triage case${pending !== 1 ? 's' : ''} pending`,
      detail:    'AI Triage queue',
      timestamp: new Date().toISOString(),
      href:      '/triage',
    });
  }

  // Recent appointments — up to 2 items
  if (Array.isArray(appointments)) {
    appointments.slice(0, 2).forEach((a, i) => {
      events.push({
        id:        `appt-${i}`,
        type:      'appointment',
        title:     'Appointment booked',
        detail:    `Patient ${(a.patientId ?? 'unknown').slice(0, 8)}…`,
        timestamp: a.bookedAt ?? new Date(Date.now() - i * 1_200_000).toISOString(),
        href:      '/scheduling',
      });
    });
  }

  // Denial deadlines — up to 2 items
  if (Array.isArray(denials)) {
    denials.slice(0, 2).forEach((d, i) => {
      events.push({
        id:        `denial-${i}`,
        type:      'denial',
        title:     `Claim ${d.claimNumber} denial`,
        detail:    `${d.payerName} — ${d.denialStatus ?? 'Open'}`,
        timestamp: d.appealDeadline ?? new Date(Date.now() - i * 3_600_000).toISOString(),
        href:      '/revenue',
      });
    });
  }

  // Sort descending by timestamp and cap to MAX_ITEMS
  return {
    events: events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_ITEMS),
    failedSources,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityFeedWidget() {
  const [events,  setEvents]  = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const backendOnline = useGlobalStore(s => s.backendOnline);
  const inFlightRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    try {
      // Skip all API calls when backend is known offline — show demo feed immediately
      if (backendOnline === false) {
        if (!controller.signal.aborted) {
          setEvents(DEMO_FEED_EVENTS);
          setFailedSources([]);
        }
        return;
      }

      const result = await buildFeed(controller.signal);
      if (controller.signal.aborted) return;

      // All 4 sources failed — use demo data so dashboard is never empty
      if (result.failedSources.length === 4) {
        setEvents(DEMO_FEED_EVENTS);
        setFailedSources([]);
      } else {
        setEvents(result.events);
        setFailedSources(result.failedSources);
      }
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      setEvents(DEMO_FEED_EVENTS);
      setFailedSources([]);
    } finally {
      window.clearTimeout(timeoutId);
      if (inFlightRequest.current === controller) {
        inFlightRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [backendOnline]);

  useEffect(() => {
    void load();
    return () => {
      inFlightRequest.current?.abort();
    };
  }, [load]);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="subtitle2" fontWeight={700}>
            Activity Feed
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => void load()} aria-label="refresh activity feed">
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {failedSources.length > 0 && failedSources.length < 4 && (
              <Alert severity="info" sx={{ mb: 1 }} onClose={() => setFailedSources([])}>
                Partial data: {failedSources.join(', ')} unavailable
              </Alert>
            )}
            {events.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No recent activity
              </Typography>
            ) : (
              <Stack gap={0.5} divider={<Divider flexItem />}>
                {events.map(ev => {
                  const meta = EVENT_META[ev.type];
                  return (
                    <Box
                  key={ev.id}
                  component={Link}
                  to={ev.href}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    py: 0.75,
                    px: 0.5,
                    borderRadius: 1,
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {/* Event type icon */}
                  <Box sx={{ color: meta.color, mt: 0.3, flexShrink: 0 }}>
                    {meta.icon}
                  </Box>

                  {/* Title + detail */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600} noWrap sx={{ display: 'block' }}>
                      {ev.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.65rem' }}>
                      {ev.detail}
                    </Typography>
                  </Box>

                  {/* Type chip + relative time */}
                  <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
                    <Chip
                      label={meta.chipLabel}
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: '0.58rem',
                        fontWeight: 600,
                        bgcolor: meta.color,
                        color: 'white',
                        mb: 0.25,
                        '& .MuiChip-label': { px: '4px' },
                      }}
                    />
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.6rem' }}>
                      {formatTimeAgo(ev.timestamp)}
                    </Typography>
                  </Box>
                </Box>
              );
                })}
              </Stack>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
