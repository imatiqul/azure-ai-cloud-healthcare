/**
 * ActivityFeedWidget — Phase 53
 *
 * Real-time clinical activity timeline shown on the dashboard right column.
 * Fetches recent events from four APIs (population-health risks, agent triage
 * stats, scheduling appointments, revenue denials) and presents them as a
 * colour-coded chronological feed with deep-links to the relevant pages.
 * Refreshes on demand via the Refresh icon button.
 */
import { useState, useEffect, useCallback } from 'react';
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const MAX_ITEMS = 8;

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

async function fetchSafe<T>(url: string, fallback: T, failedSources?: string[], sourceName?: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) { if (failedSources && sourceName) failedSources.push(sourceName); return fallback; }
    return res.json() as Promise<T>;
  } catch {
    if (failedSources && sourceName) failedSources.push(sourceName);
    return fallback;
  }
}

async function buildFeed(): Promise<{ events: ActivityEvent[]; failedSources: string[] }> {
  const failedSources: string[] = [];
  const [risks, triage, appointments, denials] = await Promise.all([
    fetchSafe<Array<{ patientId: string; riskLevel: string; assessedAt?: string }>>(
      '/api/v1/population-health/risks?top=5', [], failedSources, 'Population Health'),
    fetchSafe<{ pendingTriage?: number; awaitingReview?: number; completed?: number }>(
      '/api/v1/agents/stats', {}, failedSources, 'Triage'),
    fetchSafe<Array<{ id: string; patientId?: string; bookedAt?: string }>>(
      '/api/v1/scheduling/bookings?top=5', [], failedSources, 'Scheduling'),
    fetchSafe<Array<{ id: string; claimNumber: string; payerName: string; appealDeadline?: string; denialStatus?: string }>>(
      '/api/v1/revenue/denials?top=5', [], failedSources, 'Revenue'),
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

  const load = useCallback(async () => {
    setLoading(true);
    const result = await buildFeed();
    setEvents(result.events);
    setFailedSources(result.failedSources);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

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
            {failedSources.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setFailedSources([])}>
                Could not load data from: {failedSources.join(', ')}
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
