import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import { useGlobalStore } from '../store';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RiskEntry {
  patientId: string;
  riskLevel: string;
  riskScore: number;
  assessedAt?: string;
}

interface BreakGlassEntry {
  id: string;
  requestedByUserId: string;
  targetPatientId: string;
  clinicalJustification: string;
  grantedAt: string;
  expiresAt: string;
  isRevoked?: boolean;
}

interface WaitlistEntry {
  id: string;
  patientId: string;
  practitionerId: string;
  priority: number;
  status: string;
}

interface DenialEntry {
  id: string;
  claimNumber: string;
  payerName: string;
  deniedAmountUsd: number;
  appealDeadline: string;
  denialStatus: string;
}

interface AlertSummary {
  criticalRiskCount: number;
  highRiskCount: number;
  activeBreakGlassCount: number;
  urgentWaitlistCount: number;
  nearDeadlineDenialsCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEMO_RISKS: RiskEntry[] = [
  { patientId: 'PAT-00142', riskLevel: 'Critical', riskScore: 94, assessedAt: new Date(Date.now() - 1 * 86_400_000).toISOString() },
  { patientId: 'PAT-00278', riskLevel: 'Critical', riskScore: 91, assessedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { patientId: 'PAT-00315', riskLevel: 'High',     riskScore: 82, assessedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { patientId: 'PAT-00089', riskLevel: 'High',     riskScore: 78, assessedAt: new Date(Date.now() - 1 * 86_400_000).toISOString() },
  { patientId: 'PAT-00456', riskLevel: 'High',     riskScore: 75, assessedAt: new Date(Date.now() - 4 * 86_400_000).toISOString() },
];

const DEMO_BREAK_GLASS: BreakGlassEntry[] = [
  { id: 'bg-1', requestedByUserId: 'DR-Smith', targetPatientId: 'PAT-00142', clinicalJustification: 'Emergency consultation — patient transferred to ICU', grantedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), expiresAt: new Date(Date.now() + 4 * 3_600_000).toISOString() },
];

const DEMO_WAITLIST: WaitlistEntry[] = [
  { id: 'wl-1', patientId: 'PAT-00501', practitionerId: 'DR-Johnson', priority: 1, status: 'Waiting' },
  { id: 'wl-2', patientId: 'PAT-00612', practitionerId: 'DR-Patel',   priority: 2, status: 'Waiting' },
];

const DEMO_DENIALS: DenialEntry[] = [
  { id: 'dn-1', claimNumber: 'CLM-2026-00142', payerName: 'BlueCross BlueShield', deniedAmountUsd: 4_200, appealDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), denialStatus: 'Open' },
  { id: 'dn-2', claimNumber: 'CLM-2026-00278', payerName: 'Aetna',                deniedAmountUsd: 1_850, appealDeadline: new Date(Date.now() + 5 * 86_400_000).toISOString(), denialStatus: 'Open' },
];

function riskLevelVariant(level: string): 'destructive' | 'warning' | 'secondary' {
  if (level === 'Critical') return 'destructive';
  if (level === 'High') return 'warning';
  return 'secondary';
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClinicalAlertsCenter() {
  const [risks, setRisks] = useState<RiskEntry[]>([]);
  const [breakGlass, setBreakGlass] = useState<BreakGlassEntry[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [denials, setDenials] = useState<DenialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const backendOnline = useGlobalStore(s => s.backendOnline);

  const fetchAll = useCallback(async () => {
    if (backendOnline === false) {
      setRisks(DEMO_RISKS);
      setBreakGlass(DEMO_BREAK_GLASS);
      setWaitlist(DEMO_WAITLIST);
      setDenials(DEMO_DENIALS);
      setLastRefreshed(new Date());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [riskRes, bgRes, wlRes, denRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/population-health/risks?top=20`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${API_BASE}/api/v1/identity/break-glass`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${API_BASE}/api/v1/scheduling/waitlist`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${API_BASE}/api/v1/revenue/denials`, { signal: AbortSignal.timeout(10_000) }),
      ]);

      if (riskRes.status === 'fulfilled' && riskRes.value.ok)
        setRisks(await riskRes.value.json() as RiskEntry[]);
      else setRisks(DEMO_RISKS);

      if (bgRes.status === 'fulfilled' && bgRes.value.ok)
        setBreakGlass(await bgRes.value.json() as BreakGlassEntry[]);
      else setBreakGlass(DEMO_BREAK_GLASS);

      if (wlRes.status === 'fulfilled' && wlRes.value.ok)
        setWaitlist(await wlRes.value.json() as WaitlistEntry[]);
      else setWaitlist(DEMO_WAITLIST);

      if (denRes.status === 'fulfilled' && denRes.value.ok)
        setDenials(await denRes.value.json() as DenialEntry[]);
      else setDenials(DEMO_DENIALS);

      setLastRefreshed(new Date());
    } catch {
      // Complete network failure — seed all sections with demo data
      setRisks(DEMO_RISKS);
      setBreakGlass(DEMO_BREAK_GLASS);
      setWaitlist(DEMO_WAITLIST);
      setDenials(DEMO_DENIALS);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [backendOnline]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Derived alert collections
  const criticalRisks   = risks.filter(r => r.riskLevel === 'Critical');
  const highRisks       = risks.filter(r => r.riskLevel === 'High');
  const activeBreakGlass = breakGlass.filter(bg =>
    !bg.isRevoked && new Date(bg.expiresAt) > new Date(),
  );
  const urgentWaitlist  = waitlist.filter(w => w.priority <= 2 && w.status === 'Waiting');
  const nearDeadline    = denials.filter(d => {
    const days = daysUntil(d.appealDeadline);
    return days >= 0 && days <= 7 && d.denialStatus === 'Open';
  });

  const summary: AlertSummary = {
    criticalRiskCount:        criticalRisks.length,
    highRiskCount:            highRisks.length,
    activeBreakGlassCount:    activeBreakGlass.length,
    urgentWaitlistCount:      urgentWaitlist.length,
    nearDeadlineDenialsCount: nearDeadline.length,
  };

  const totalAlerts =
    summary.criticalRiskCount +
    summary.activeBreakGlassCount +
    summary.urgentWaitlistCount +
    summary.nearDeadlineDenialsCount;

  // Persist active alert count for the sidebar badge (Phase 53)
  useEffect(() => {
    try {
      localStorage.setItem('hq:alerts-count', String(totalAlerts));
      window.dispatchEvent(new CustomEvent('hq:alerts-updated'));
    } catch { /* ignore */ }
  }, [totalAlerts]);

  return (
    <Box sx={{ p: 3 }}>
      {/* ── Header ── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Clinical Alerts Center
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Real-time aggregated view of all critical clinical events requiring attention
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1}>
          {lastRefreshed && (
            <Typography variant="caption" color="text.secondary">
              Updated {lastRefreshed.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh all alerts">
            <IconButton onClick={() => void fetchAll()} aria-label="Refresh alerts" size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Summary chips ── */}
      <Stack direction="row" flexWrap="wrap" gap={1} mb={3}>
        <Chip
          icon={<PriorityHighIcon />}
          label={`${totalAlerts} Active Alert${totalAlerts !== 1 ? 's' : ''}`}
          color={totalAlerts > 0 ? 'error' : 'default'}
          size="small"
          sx={{ fontWeight: 600 }}
        />
        <Chip
          icon={<WarningAmberIcon />}
          label={`${summary.criticalRiskCount} Critical Risk`}
          color={summary.criticalRiskCount > 0 ? 'error' : 'default'}
          size="small"
        />
        <Chip
          label={`${summary.highRiskCount} High Risk`}
          color={summary.highRiskCount > 0 ? 'warning' : 'default'}
          size="small"
        />
        <Chip
          icon={<LockOpenIcon />}
          label={`${summary.activeBreakGlassCount} Break-Glass Active`}
          color={summary.activeBreakGlassCount > 0 ? 'warning' : 'default'}
          size="small"
        />
        <Chip
          icon={<AccessTimeIcon />}
          label={`${summary.urgentWaitlistCount} Urgent Waitlist`}
          color={summary.urgentWaitlistCount > 0 ? 'warning' : 'default'}
          size="small"
        />
        <Chip
          icon={<MoneyOffIcon />}
          label={`${summary.nearDeadlineDenialsCount} Denial Deadlines ≤7d`}
          color={summary.nearDeadlineDenialsCount > 0 ? 'error' : 'default'}
          size="small"
        />
      </Stack>

      <Grid container spacing={3}>
        {/* ── Critical & High Risk Patients ── */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <CardTitle>High-Risk Patients</CardTitle>
                <Chip
                  label={criticalRisks.length + highRisks.length}
                  size="small"
                  color={criticalRisks.length > 0 ? 'error' : 'warning'}
                />
              </Stack>
            </CardHeader>
            <CardContent>
              {criticalRisks.length === 0 && highRisks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No high-risk patients at this time.
                </Typography>
              ) : (
                <Stack gap={1.5}>
                  {[...criticalRisks, ...highRisks].slice(0, 8).map(r => (
                    <Stack key={r.patientId} direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" alignItems="center" gap={1}>
                        <PersonSearchIcon fontSize="small" color="action" />
                        <Typography variant="body2" fontFamily="monospace">{r.patientId}</Typography>
                      </Stack>
                      <Stack direction="row" gap={1} alignItems="center">
                        <LinearProgress
                          variant="determinate"
                          value={r.riskScore * 100}
                          color={r.riskLevel === 'Critical' ? 'error' : 'warning'}
                          sx={{ width: 64, borderRadius: 1 }}
                        />
                        <Badge variant={riskLevelVariant(r.riskLevel)}>{r.riskLevel}</Badge>
                      </Stack>
                    </Stack>
                  ))}
                  {(criticalRisks.length + highRisks.length) > 8 && (
                    <Typography variant="caption" color="text.secondary">
                      … and {(criticalRisks.length + highRisks.length) - 8} more.{' '}
                      <Link to="/population-health">View all in Population Health →</Link>
                    </Typography>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Active Break-Glass Accesses ── */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <CardTitle>Active Break-Glass Accesses</CardTitle>
                <Chip
                  label={activeBreakGlass.length}
                  size="small"
                  color={activeBreakGlass.length > 0 ? 'warning' : 'default'}
                />
              </Stack>
            </CardHeader>
            <CardContent>
              {activeBreakGlass.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active break-glass sessions.
                </Typography>
              ) : (
                <Stack gap={1.5} divider={<Divider flexItem />}>
                  {activeBreakGlass.map(bg => (
                    <Box key={bg.id}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600}>{bg.requestedByUserId}</Typography>
                        <Badge variant="warning">Active</Badge>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Patient: <span style={{ fontFamily: 'monospace' }}>{bg.targetPatientId}</span>
                      </Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">
                        Expires: {new Date(bg.expiresAt).toLocaleString()}
                      </Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        Justification: {bg.clinicalJustification.slice(0, 80)}{bg.clinicalJustification.length > 80 ? '…' : ''}
                      </Typography>
                    </Box>
                  ))}
                  <Typography variant="caption">
                    <Link to="/admin/break-glass">Manage break-glass access →</Link>
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Urgent Waitlist Entries ── */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <CardTitle>Urgent Waitlist</CardTitle>
                <Chip
                  label={urgentWaitlist.length}
                  size="small"
                  color={urgentWaitlist.length > 0 ? 'warning' : 'default'}
                />
              </Stack>
            </CardHeader>
            <CardContent>
              {urgentWaitlist.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No urgent waitlist entries.
                </Typography>
              ) : (
                <Stack gap={1} divider={<Divider flexItem />}>
                  {urgentWaitlist.map(w => (
                    <Stack key={w.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2" fontFamily="monospace">{w.patientId}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Practitioner: {w.practitionerId}
                        </Typography>
                      </Box>
                      <Chip
                        label={`P${w.priority} — ${w.priority === 1 ? 'Urgent' : 'High'}`}
                        size="small"
                        color="error"
                      />
                    </Stack>
                  ))}
                  <Typography variant="caption">
                    <Link to="/scheduling">Manage scheduling →</Link>
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Near-Deadline Claim Denials ── */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <CardTitle>Claim Denials — Appeal Deadlines ≤7 Days</CardTitle>
                <Chip
                  label={nearDeadline.length}
                  size="small"
                  color={nearDeadline.length > 0 ? 'error' : 'default'}
                />
              </Stack>
            </CardHeader>
            <CardContent>
              {nearDeadline.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No imminent denial deadlines.
                </Typography>
              ) : (
                <Stack gap={1} divider={<Divider flexItem />}>
                  {nearDeadline.map(d => {
                    const days = daysUntil(d.appealDeadline);
                    return (
                      <Stack key={d.id} direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{d.claimNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {d.payerName} · ${d.deniedAmountUsd.toLocaleString()}
                          </Typography>
                        </Box>
                        <Chip
                          label={days === 0 ? 'Today!' : `${days}d left`}
                          size="small"
                          color={days <= 2 ? 'error' : 'warning'}
                        />
                      </Stack>
                    );
                  })}
                  <Typography variant="caption">
                    <Link to="/revenue">Manage denials →</Link>
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
