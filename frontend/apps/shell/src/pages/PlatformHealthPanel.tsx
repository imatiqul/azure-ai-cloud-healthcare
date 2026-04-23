import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useGlobalStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Service definitions ────────────────────────────────────────────────────

interface ServiceDefinition {
  name: string;
  label: string;
  probePath: string;
  description: string;
}

const SERVICES: ServiceDefinition[] = [
  { name: 'agents',      label: 'AI Agents',            probePath: '/api/v1/agents/governance/history',          description: 'Agentic AI & model governance' },
  { name: 'voice',       label: 'Voice Transcription',  probePath: '/api/v1/voice/sessions',                     description: 'Real-time voice & STT pipeline' },
  { name: 'triage',      label: 'AI Triage',            probePath: '/api/v1/triage/assessments',                 description: 'Clinical triage classification' },
  { name: 'scheduling',  label: 'Scheduling',           probePath: '/api/v1/scheduling/slots',                   description: 'Appointment & waitlist management' },
  { name: 'pophealth',   label: 'Population Health',    probePath: '/api/v1/population-health/risks',            description: 'Risk stratification & HEDIS' },
  { name: 'revenue',     label: 'Revenue Cycle',        probePath: '/api/v1/revenue/coding-jobs',                description: 'Clinical coding & claim management' },
  { name: 'fhir',        label: 'FHIR Interop',         probePath: '/api/v1/fhir/patients',                      description: 'HL7 FHIR R4 clinical data exchange' },
  { name: 'identity',    label: 'Identity & Auth',      probePath: '/api/v1/identity/users?pageSize=1',          description: 'Patient auth & B2C integration' },
  { name: 'notifications', label: 'Notifications',      probePath: '/api/v1/notifications/analytics/delivery',   description: 'Push, email & SMS delivery' },
  { name: 'ocr',         label: 'Document OCR',         probePath: '/api/v1/ocr/jobs',                           description: 'Document extraction & processing' },
];

// ── Status types ───────────────────────────────────────────────────────────

type ServiceStatus = 'checking' | 'up' | 'degraded' | 'down';

interface ServiceHealth {
  service: ServiceDefinition;
  status: ServiceStatus;
  httpStatus: number | null;
  responseMs: number | null;
  checkedAt: Date;
}

// ── Probe a single service ────────────────────────────────────────────────

async function probeService(svc: ServiceDefinition): Promise<ServiceHealth> {
  const start = performance.now();
  const checkedAt = new Date();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${svc.probePath}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    const responseMs = Math.round(performance.now() - start);
    // Any HTTP response (incl. 401/403/404) means the service is UP and responding
    const status: ServiceStatus = res.status >= 500 ? 'degraded' : 'up';
    return { service: svc, status, httpStatus: res.status, responseMs, checkedAt };
  } catch (err) {
    const responseMs = Math.round(performance.now() - start);
    const status: ServiceStatus = responseMs < 5100 ? 'down' : 'down';
    return { service: svc, status, httpStatus: null, responseMs, checkedAt };
  }
}

// ── Status icon component ─────────────────────────────────────────────────

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === 'checking') return <CircularProgress size={18} />;
  if (status === 'up')       return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />;
  if (status === 'degraded') return <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 20 }} />;
  if (status === 'down')     return <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />;
  return <HelpOutlineIcon sx={{ fontSize: 20 }} />;
}

function statusColor(status: ServiceStatus) {
  if (status === 'up')       return 'success' as const;
  if (status === 'degraded') return 'warning' as const;
  if (status === 'down')     return 'error'   as const;
  return 'default' as const;
}

function statusLabel(status: ServiceStatus) {
  if (status === 'checking') return 'Checking…';
  if (status === 'up')       return 'Operational';
  if (status === 'degraded') return 'Degraded';
  if (status === 'down')     return 'Unreachable';
  return 'Unknown';
}

// ── Service card ──────────────────────────────────────────────────────────

function ServiceCard({ health }: { health: ServiceHealth }) {
  const { service, status, httpStatus, responseMs } = health;

  const borderColor =
    status === 'up'       ? 'success.main'  :
    status === 'degraded' ? 'warning.main'  :
    status === 'down'     ? 'error.main'    :
                            'divider';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor,
        opacity: status === 'checking' ? 0.7 : 1,
        transition: 'border-color 0.3s, opacity 0.3s',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            {service.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {service.description}
          </Typography>
        </Box>
        <StatusIcon status={status} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          label={statusLabel(status)}
          size="small"
          color={statusColor(status)}
          variant={status === 'up' ? 'filled' : 'outlined'}
        />
        {httpStatus !== null && (
          <Chip
            label={`HTTP ${httpStatus}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
        )}
        {responseMs !== null && status !== 'checking' && (
          <Chip
            label={`${responseMs}ms`}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.7rem',
              borderColor: responseMs > 2000 ? 'warning.main' : 'divider',
              color: responseMs > 2000 ? 'warning.main' : 'text.secondary',
            }}
          />
        )}
      </Box>
    </Paper>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PlatformHealthPanel() {
  const [healthMap, setHealthMap] = useState<Map<string, ServiceHealth>>(new Map());
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const backendOnline = useGlobalStore(s => s.backendOnline);

  const runChecks = useCallback(async () => {
    if (backendOnline === false) {
      // Backend is known offline — mark all services as down without probing
      const offlineMap = new Map<string, ServiceHealth>();
      for (const svc of SERVICES) {
        offlineMap.set(svc.name, {
          service: svc,
          status: 'down',
          httpStatus: null,
          responseMs: null,
          checkedAt: new Date(),
        });
      }
      setHealthMap(offlineMap);
      setLastChecked(new Date());
      return;
    }
    setChecking(true);
    // Reset all to 'checking'
    setHealthMap(prev => {
      const next = new Map(prev);
      for (const svc of SERVICES) {
        const existing = next.get(svc.name);
        next.set(svc.name, {
          service: svc,
          status: 'checking',
          httpStatus: existing?.httpStatus ?? null,
          responseMs: existing?.responseMs ?? null,
          checkedAt: new Date(),
        });
      }
      return next;
    });

    // Probe all services in parallel
    const results = await Promise.allSettled(SERVICES.map(svc => probeService(svc)));

    setHealthMap(() => {
      const next = new Map<string, ServiceHealth>();
      results.forEach((res, i) => {
        const svc = SERVICES[i];
        if (res.status === 'fulfilled') {
          next.set(svc.name, res.value);
        } else {
          next.set(svc.name, {
            service: svc,
            status: 'down',
            httpStatus: null,
            responseMs: null,
            checkedAt: new Date(),
          });
        }
      });
      return next;
    });

    setLastChecked(new Date());
    setChecking(false);
  }, [backendOnline]);

  useEffect(() => { void runChecks(); }, [runChecks]);

  // ── Summary stats ──────────────────────────────────────────────────────

  const allHealth = Array.from(healthMap.values());
  const upCount       = allHealth.filter(h => h.status === 'up').length;
  const degradedCount = allHealth.filter(h => h.status === 'degraded').length;
  const downCount     = allHealth.filter(h => h.status === 'down').length;
  const avgResponseMs = allHealth.filter(h => h.responseMs !== null && h.status !== 'checking')
    .reduce((sum, h, _, arr) => sum + (h.responseMs ?? 0) / arr.length, 0);

  const overallStatus: ServiceStatus =
    downCount > 0     ? 'down'     :
    degradedCount > 0 ? 'degraded' :
    upCount === SERVICES.length ? 'up' : 'checking';

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Platform Health
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time service availability — {SERVICES.length} microservices
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastChecked && (
            <Typography variant="caption" color="text.disabled">
              Last checked {lastChecked.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Re-check all services">
            <span>
              <IconButton size="small" onClick={() => void runChecks()} disabled={checking} aria-label="refresh health">
                {checking ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Overall status banner ── */}
      <Alert
        severity={overallStatus === 'up' ? 'success' : overallStatus === 'degraded' ? 'warning' : overallStatus === 'down' ? 'error' : 'info'}
        sx={{ mb: 2 }}
        icon={<StatusIcon status={overallStatus} />}
      >
        <Typography variant="body2" fontWeight={600}>
          {overallStatus === 'up'       && 'All systems operational'}
          {overallStatus === 'degraded' && `${degradedCount} service${degradedCount > 1 ? 's' : ''} degraded`}
          {overallStatus === 'down'     && `${downCount} service${downCount > 1 ? 's' : ''} unreachable`}
          {overallStatus === 'checking' && 'Checking services…'}
        </Typography>
      </Alert>

      {/* ── Summary chips ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip label={`${upCount} Operational`}  size="small" color="success" />
        {degradedCount > 0 && <Chip label={`${degradedCount} Degraded`}  size="small" color="warning" />}
        {downCount     > 0 && <Chip label={`${downCount} Unreachable`} size="small" color="error" />}
        {avgResponseMs > 0 && (
          <Chip
            label={`Avg ${Math.round(avgResponseMs)}ms`}
            size="small"
            variant="outlined"
            color={avgResponseMs > 2000 ? 'warning' : 'default'}
          />
        )}
        <Chip label={`${SERVICES.length} services`} size="small" variant="outlined" />
      </Box>

      {/* ── Uptime progress bar ── */}
      {!checking && allHealth.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Platform availability</Typography>
            <Typography variant="caption" fontWeight={600} color={overallStatus === 'up' ? 'success.main' : 'warning.main'}>
              {Math.round((upCount / SERVICES.length) * 100)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(upCount / SERVICES.length) * 100}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                bgcolor: overallStatus === 'up' ? 'success.main' : overallStatus === 'degraded' ? 'warning.main' : 'error.main',
              },
            }}
          />
        </Box>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* ── Service grid ── */}
      <Grid container spacing={2}>
        {SERVICES.map(svc => {
          const health = healthMap.get(svc.name) ?? {
            service: svc,
            status: 'checking' as ServiceStatus,
            httpStatus: null,
            responseMs: null,
            checkedAt: new Date(),
          };
          return (
            <Grid item xs={12} sm={6} md={4} key={svc.name}>
              <ServiceCard health={health} />
            </Grid>
          );
        })}
      </Grid>

      {/* ── Note ── */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="caption">
          Service health is probed via APIM gateway. HTTP 401/403/404 responses indicate the service is
          operational (authentication required). HTTP 5xx or network errors indicate service degradation.
          Probes run with a 5-second timeout.
        </Typography>
      </Alert>
    </Box>
  );
}
