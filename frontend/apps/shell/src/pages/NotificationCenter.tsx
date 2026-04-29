import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshIcon from '@mui/icons-material/Refresh';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationRecord {
  id:         string;
  title:      string;
  subtitle:   string;
  severity:   'error' | 'warning' | 'info';
  href:       string;
  read:       boolean;
  receivedAt: string; // ISO date string
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'hq:notification-history';

function loadHistory(): NotificationRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveHistory(records: NotificationRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ── Alert fetching (mirrors TopNav live alerts) ───────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function fetchJsonIfOk(url: string, signal?: AbortSignal): Promise<{ data: any | null; failed: boolean }> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return { data: null, failed: true };
    }
    return { data: await response.json(), failed: false };
  } catch (error) {
    if (isAbortLikeError(error) || signal?.aborted) {
      throw error;
    }
    return { data: null, failed: true };
  }
}

async function fetchLiveAlerts(signal?: AbortSignal): Promise<{ alerts: Omit<NotificationRecord, 'read' | 'receivedAt'>[]; hadSourceErrors: boolean }> {
  const alerts: Omit<NotificationRecord, 'read' | 'receivedAt'>[] = [];
  let hadSourceErrors = false;
  try {
    const [denialsResult, triageResult, deliveryResult] = await Promise.all([
      fetchJsonIfOk(`${API_BASE}/api/v1/revenue/denials/analytics`, signal),
      fetchJsonIfOk(`${API_BASE}/api/v1/agents/triage?top=50`, signal),
      fetchJsonIfOk(`${API_BASE}/api/v1/notifications/analytics/delivery`, signal),
    ]);

    const denials = denialsResult.data;
    const triage = triageResult.data;
    const delivery = deliveryResult.data;
    hadSourceErrors = denialsResult.failed || triageResult.failed || deliveryResult.failed;

    if (denials?.nearDeadlineCount > 0) {
      alerts.push({
        id:       'denials-deadline',
        title:    `${denials.nearDeadlineCount} claim denial${denials.nearDeadlineCount > 1 ? 's' : ''} near deadline`,
        subtitle: `${denials.openCount ?? 0} open • Appeal before deadline to avoid write-off`,
        severity: 'error',
        href:     '/revenue',
      });
    }
    if (denials?.openCount > 5) {
      alerts.push({
        id:       'denials-open',
        title:    `${denials.openCount} open claim denials`,
        subtitle: `Overturn rate: ${Math.round((denials.overTurnRate ?? 0) * 100)}%`,
        severity: 'warning',
        href:     '/revenue',
      });
    }

    const pending = Array.isArray(triage)
      ? triage.filter((t: any) => t.status === 'Pending' || t.urgencyLevel === 'P1' || t.urgencyLevel === 'P2').length
      : 0;
    if (pending > 0) {
      alerts.push({
        id:       'triage-pending',
        title:    `${pending} high-priority triage session${pending > 1 ? 's' : ''} pending`,
        subtitle: 'Requires immediate clinical review',
        severity: 'error',
        href:     '/triage',
      });
    }

    if (delivery && (delivery.failureRate ?? 0) > 0.1) {
      const failedCount = delivery.failed ?? 0;
      alerts.push({
        id:       'delivery-failures',
        title:    `${failedCount} notification${failedCount !== 1 ? 's' : ''} failed to deliver`,
        subtitle: `Delivery rate: ${Math.round((delivery.deliveryRate ?? 0) * 100)}%`,
        severity: 'warning',
        href:     '/patient-portal',
      });
    }
  } catch (error) {
    if (isAbortLikeError(error) || signal?.aborted) {
      throw error;
    }
    hadSourceErrors = true;
  }

  return { alerts, hadSourceErrors };
}

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: 'error' | 'warning' | 'info' }) {
  if (severity === 'error')   return <ErrorOutlineIcon fontSize="small" />;
  if (severity === 'warning') return <WarningAmberIcon fontSize="small" />;
  return <InfoOutlinedIcon fontSize="small" />;
}

function severityColor(severity: 'error' | 'warning' | 'info') {
  if (severity === 'error')   return 'error.main';
  if (severity === 'warning') return 'warning.main';
  return 'info.main';
}

// ── Page ──────────────────────────────────────────────────────────────────────
import { useGlobalStore } from '../store';
export default function NotificationCenter() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSourceWarning, setLiveSourceWarning] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const backendOnline = useGlobalStore(s => s.backendOnline);
  const activeRefresh = useRef<AbortController | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLiveSourceWarning('');

    const history = loadHistory();
    if (backendOnline === false) {
      if (!signal.aborted) {
        setRecords(history);
        setLoading(false);
      }
      return;
    }

    try {
      const { alerts: liveAlerts, hadSourceErrors } = await fetchLiveAlerts(signal);
      if (signal.aborted) return;

      const now = new Date().toISOString();
      const existingIds = new Set(history.map(h => h.id));
      const newRecords = liveAlerts
        .filter(a => !existingIds.has(a.id))
        .map(a => ({ ...a, read: false, receivedAt: now }));

      const merged = [...newRecords, ...history].slice(0, 100);
      saveHistory(merged);
      setRecords(merged);

      if (hadSourceErrors) {
        setLiveSourceWarning('Some live alert sources are unavailable. Showing saved notification history where needed.');
      }
    } catch (error) {
      if (isAbortLikeError(error) || signal.aborted) return;
      setRecords(history);
      setLiveSourceWarning('Live alert sources are temporarily unavailable. Showing saved notification history.');
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [backendOnline]);

  const runRefresh = useCallback(() => {
    activeRefresh.current?.abort();
    const controller = new AbortController();
    activeRefresh.current = controller;
    void refresh(controller.signal);
  }, [refresh]);

  useEffect(() => {
    runRefresh();
    return () => {
      activeRefresh.current?.abort();
    };
  }, [runRefresh]);

  const markAllRead = () => {
    const updated = records.map(r => ({ ...r, read: true }));
    saveHistory(updated);
    setRecords(updated);
  };

  const clearAll = () => {
    saveHistory([]);
    setRecords([]);
  };

  const handleClick = (record: NotificationRecord) => {
    const updated = records.map(r => r.id === record.id ? { ...r, read: true } : r);
    saveHistory(updated);
    setRecords(updated);
    navigate(record.href);
  };

  const unreadCount = records.filter(r => !r.read).length;

  const visibleRecords = records.filter(r => {
    if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
    if (unreadOnly && r.read) return false;
    return true;
  });

  const errorCount   = records.filter(r => r.severity === 'error').length;
  const warningCount = records.filter(r => r.severity === 'warning').length;
  const infoCount    = records.filter(r => r.severity === 'info').length;

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>

      {/* ── Header ── */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} gutterBottom={false}>
            Notification Center
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
            <Chip
              label={`${unreadCount} unread`}
              size="small"
              color={unreadCount > 0 ? 'primary' : 'default'}
            />
            <Chip
              label={`${records.length} total`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>

        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Mark all read">
            <span>
              <IconButton
                size="small"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                aria-label="Mark all read"
              >
                <MarkEmailReadIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear history">
            <span>
              <IconButton
                size="small"
                onClick={clearAll}
                disabled={records.length === 0}
                aria-label="Clear history"
              >
                <DeleteSweepIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={runRefresh} aria-label="Refresh notifications">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {liveSourceWarning && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="warning.main">
            {liveSourceWarning}
          </Typography>
        </Box>
      )}

      {/* ── Filter bar ── */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip
          label="All"
          size="small"
          variant={filterSeverity === 'all' ? 'filled' : 'outlined'}
          onClick={() => setFilterSeverity('all')}
        />
        <Chip
          label={`Critical${errorCount > 0 ? ` (${errorCount})` : ''}`}
          size="small"
          color="error"
          variant={filterSeverity === 'error' ? 'filled' : 'outlined'}
          onClick={() => setFilterSeverity('error')}
        />
        <Chip
          label={`Warning${warningCount > 0 ? ` (${warningCount})` : ''}`}
          size="small"
          color="warning"
          variant={filterSeverity === 'warning' ? 'filled' : 'outlined'}
          onClick={() => setFilterSeverity('warning')}
        />
        <Chip
          label={`Info${infoCount > 0 ? ` (${infoCount})` : ''}`}
          size="small"
          color="info"
          variant={filterSeverity === 'info' ? 'filled' : 'outlined'}
          onClick={() => setFilterSeverity('info')}
        />
        <Chip
          label="Unread only"
          size="small"
          color={unreadOnly ? 'primary' : 'default'}
          variant={unreadOnly ? 'filled' : 'outlined'}
          onClick={() => setUnreadOnly(v => !v)}
        />
      </Stack>

      {/* ── Body ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : records.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <NotificationsOffIcon sx={{ fontSize: 52, color: 'text.disabled', mb: 2 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No notifications yet
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Live platform alerts will appear here automatically
          </Typography>
        </Box>
      ) : visibleRecords.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            No notifications match the selected filter
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          {visibleRecords.map((record, idx) => (
            <Box key={record.id}>
              {idx > 0 && <Divider />}
              <Box
                role="button"
                tabIndex={0}
                onClick={() => handleClick(record)}
                onKeyDown={(e) => e.key === 'Enter' && handleClick(record)}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  cursor: 'pointer',
                  opacity: record.read ? 0.6 : 1,
                  bgcolor: record.read ? 'transparent' : 'action.hover',
                  borderLeft: 3,
                  borderColor: severityColor(record.severity),
                  '&:hover': { bgcolor: 'action.selected' },
                  transition: 'background 0.15s',
                }}
              >
                <Box sx={{ color: severityColor(record.severity), mt: 0.25, flexShrink: 0 }}>
                  <SeverityIcon severity={record.severity} />
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography
                      variant="body2"
                      fontWeight={record.read ? 400 : 600}
                      noWrap
                      sx={{ flex: 1 }}
                    >
                      {record.title}
                    </Typography>
                    {!record.read && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {record.subtitle}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" display="block">
                    {new Date(record.receivedAt).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
