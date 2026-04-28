import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import RefreshIcon from '@mui/icons-material/Refresh';
import ApartmentIcon from '@mui/icons-material/Apartment';
import GroupIcon from '@mui/icons-material/Group';
import StarRateIcon from '@mui/icons-material/StarRate';
import PsychologyIcon from '@mui/icons-material/Psychology';
import GavelIcon from '@mui/icons-material/Gavel';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CampaignIcon from '@mui/icons-material/Campaign';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import SecurityIcon from '@mui/icons-material/Security';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Data interfaces ────────────────────────────────────────────────────────

interface TenantsResponse { total: number; items?: unknown[] }
interface UsersResponse { total: number }
interface FeedbackSummary {
  totalFeedback: number;
  averageRating: number;
  positiveCount: number;
  negativeCount: number;
  ingestedCount: number;
}
interface DenialAnalytics {
  openCount: number;
  underAppealCount: number;
  overTurnRate: number;
  nearDeadlineCount: number;
}
interface DeliveryAnalytics {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  failureRate: number;
}
interface DemoSession {
  sessionId: string;
  status: string;
  npsScore: number;
  completedAt?: string;
}
interface ModelRegistryEntry {
  id: string;
  isActive: boolean;
}
interface Campaign { id: string; status: string }
interface WorkflowSummaryMetrics {
  total: number;
  awaitingHumanReview: number;
  attentionRequired: number;
  bookedToday: number;
  waitlistFallbacks: number;
  reviewOverdue: number;
  averageReviewMinutes: number | null;
  automationCompletionRate: number | null;
  autoBooked: number;
  manualBooked: number;
}

interface KpiData {
  tenantCount: number | null;
  userCount: number | null;
  feedback: FeedbackSummary | null;
  denials: DenialAnalytics | null;
  delivery: DeliveryAnalytics | null;
  demoSessions: DemoSession[] | null;
  models: ModelRegistryEntry[] | null;
  campaigns: Campaign[] | null;
  workflowSummary: WorkflowSummaryMetrics | null;
  loadedAt: Date;
}

// ── KPI card ───────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: ReactNode;
  subtitle?: string;
  accent: string;
  icon: ReactNode;
  progress?: number;
  loading: boolean;
}

function KpiCard({ title, value, subtitle, accent, icon, progress, loading }: KpiCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* accent bar */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: accent }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Typography
          variant="caption"
          fontWeight={600}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing="0.08em"
          lineHeight={1.3}
          sx={{ maxWidth: '70%' }}
        >
          {title}
        </Typography>
        <Box sx={{ color: accent, opacity: 0.8, mt: -0.5 }}>{icon}</Box>
      </Box>

      {loading ? (
        <CircularProgress size={22} sx={{ color: accent, my: 0.5 }} />
      ) : (
        <Box>
          <Typography variant="h4" fontWeight={700} lineHeight={1} sx={{ color: accent }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
              {subtitle}
            </Typography>
          )}
        </Box>
      )}

      {progress !== undefined && !loading && (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, Math.max(0, progress))}
          sx={{
            mt: 1.5,
            height: 5,
            borderRadius: 3,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': { bgcolor: accent },
          }}
        />
      )}
    </Paper>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 3 }}>
      <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: accent, flexShrink: 0 }} />
      <Typography variant="overline" fontWeight={700} color="text.secondary" letterSpacing="0.12em">
        {title}
      </Typography>
      <Divider sx={{ flex: 1 }} />
    </Box>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

// ── Demo KPI data (shown when backend is offline) ─────────────────────────

const DEMO_KPI: KpiData = {
  tenantCount:  12,
  userCount:    847,
  feedback: {
    totalFeedback: 1_243,
    averageRating: 4.3,
    positiveCount: 1_089,
    negativeCount: 154,
    ingestedCount: 1_243,
  },
  denials: {
    openCount:        31,
    underAppealCount: 14,
    overTurnRate:     0.62,
    nearDeadlineCount: 7,
  },
  delivery: {
    total:        18_420,
    delivered:    17_984,
    failed:       221,
    pending:      215,
    deliveryRate: 0.976,
    failureRate:  0.012,
  },
  demoSessions: [
    { sessionId: 'demo-sess-001', status: 'Completed', npsScore: 9 },
    { sessionId: 'demo-sess-002', status: 'Completed', npsScore: 8 },
    { sessionId: 'demo-sess-003', status: 'Completed', npsScore: 9 },
    { sessionId: 'demo-sess-004', status: 'InProgress', npsScore: 0 },
    { sessionId: 'demo-sess-005', status: 'Completed', npsScore: 7 },
    { sessionId: 'demo-sess-006', status: 'Completed', npsScore: 10 },
  ],
  models: [
    { id: 'readmission-v3', isActive: true },
    { id: 'triage-classifier-v2', isActive: true },
    { id: 'nlp-coder-v1', isActive: true },
    { id: 'readmission-v2', isActive: false },
    { id: 'triage-classifier-v1', isActive: false },
  ],
  campaigns: [
    { id: 'diab-screening-2026', status: 'Active' },
    { id: 'flu-outreach-q2',    status: 'Active' },
    { id: 'cardiac-followup',   status: 'Active' },
    { id: 'wellness-q1',        status: 'Completed' },
  ],
  workflowSummary: {
    total: 214,
    awaitingHumanReview: 6,
    attentionRequired: 11,
    bookedToday: 18,
    waitlistFallbacks: 4,
    reviewOverdue: 2,
    averageReviewMinutes: 17.5,
    automationCompletionRate: 0.83,
    autoBooked: 12,
    manualBooked: 6,
  },
  loadedAt: new Date(),
};

// ── Main component ─────────────────────────────────────────────────────────

export default function BusinessKpiDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [tenants, users, feedback, denials, delivery, demo, models, campaigns, workflowSummary] =
      await Promise.allSettled([
        safeFetch<TenantsResponse>('/api/v1/tenants?page=1&pageSize=1'),
        safeFetch<UsersResponse>('/api/v1/identity/users?pageSize=1'),
        safeFetch<FeedbackSummary>(`/api/v1/agents/feedback/summary?since=${since30d}`),
        safeFetch<DenialAnalytics>('/api/v1/revenue/denials/analytics'),
        safeFetch<DeliveryAnalytics>('/api/v1/notifications/analytics/delivery'),
        safeFetch<DemoSession[]>('/api/v1/agents/demo/sessions'),
        safeFetch<ModelRegistryEntry[]>('/api/v1/agents/governance/history'),
        safeFetch<Campaign[]>('/api/v1/notifications/campaigns'),
        safeFetch<WorkflowSummaryMetrics>('/api/v1/agents/workflows/summary'),
      ]);

    const loaded: KpiData = {
      tenantCount: tenants.status === 'fulfilled' ? (tenants.value?.total ?? null) : null,
      userCount:   users.status === 'fulfilled'   ? (users.value?.total ?? null)   : null,
      feedback:    feedback.status === 'fulfilled' ? feedback.value : null,
      denials:     denials.status === 'fulfilled'  ? denials.value  : null,
      delivery:    delivery.status === 'fulfilled' ? delivery.value : null,
      demoSessions: demo.status === 'fulfilled'    ? demo.value     : null,
      models:       models.status === 'fulfilled'  ? models.value   : null,
      campaigns:    campaigns.status === 'fulfilled' ? campaigns.value : null,
      workflowSummary: workflowSummary.status === 'fulfilled' ? workflowSummary.value : null,
      loadedAt: new Date(),
    };

    // When every source returns null the backend is offline — show demo KPIs
    const allNull =
      loaded.tenantCount === null && loaded.userCount === null &&
      loaded.feedback === null && loaded.denials === null &&
      loaded.delivery === null && loaded.demoSessions === null &&
      loaded.models === null && loaded.campaigns === null &&
      loaded.workflowSummary === null;

    setKpi(allNull ? { ...DEMO_KPI, loadedAt: new Date() } : loaded);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Derived values ────────────────────────────────────────────────────────

  const activeModels   = kpi?.models?.filter(m => m.isActive).length ?? null;
  const totalModels    = kpi?.models?.length ?? null;
  const completedDemos = kpi?.demoSessions?.filter(s => s.status === 'Completed').length ?? null;
  const avgNps = kpi?.demoSessions?.length
    ? (kpi.demoSessions.reduce((s, d) => s + (d.npsScore ?? 0), 0) / kpi.demoSessions.length).toFixed(1)
    : null;
  const activeCampaigns = kpi?.campaigns?.filter(c => c.status === 'Active').length ?? null;
  const aiQualityPct    = kpi?.feedback?.averageRating != null
    ? Math.round((kpi.feedback.averageRating / 5) * 100)
    : null;
  const deliveryRatePct = kpi?.delivery?.deliveryRate != null
    ? Math.round(kpi.delivery.deliveryRate * 100)
    : null;
  const automationRatePct = kpi?.workflowSummary?.automationCompletionRate != null
    ? Math.round(kpi.workflowSummary.automationCompletionRate * 100)
    : null;

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Business Intelligence
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Platform KPIs — executive overview
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {kpi && (
            <Typography variant="caption" color="text.disabled">
              Updated {kpi.loadedAt.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh all KPIs">
            <span>
              <IconButton size="small" onClick={() => void fetchAll()} disabled={loading} aria-label="refresh">
                {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Platform Overview ─────────────────────────────────────────────── */}
      <SectionHeader title="Platform Overview" accent="#1976d2" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Active Tenants"
            value={fmtNum(kpi?.tenantCount)}
            subtitle="organisations on platform"
            accent="#1976d2"
            icon={<ApartmentIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Platform Users"
            value={fmtNum(kpi?.userCount)}
            subtitle="registered accounts"
            accent="#0288d1"
            icon={<GroupIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="AI Quality Score"
            value={aiQualityPct !== null ? `${aiQualityPct}%` : '—'}
            subtitle={kpi?.feedback ? `${fmtNum(kpi.feedback.totalFeedback)} feedback events (30d)` : 'Last 30 days'}
            accent={aiQualityPct !== null && aiQualityPct >= 80 ? '#2e7d32' : aiQualityPct !== null && aiQualityPct >= 60 ? '#ed6c02' : '#d32f2f'}
            icon={<StarRateIcon />}
            progress={aiQualityPct ?? undefined}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="AI Models Active"
            value={activeModels !== null ? `${activeModels} / ${totalModels}` : '—'}
            subtitle="models in production registry"
            accent="#7b1fa2"
            icon={<PsychologyIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Clinical Workflow Operations ────────────────────────────────── */}
      <SectionHeader title="Clinical Workflow Operations" accent="#1565c0" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Awaiting Human Review"
            value={fmtNum(kpi?.workflowSummary?.awaitingHumanReview)}
            subtitle={kpi?.workflowSummary ? `${fmtNum(kpi.workflowSummary.reviewOverdue)} overdue` : 'urgent workflows waiting'}
            accent={kpi?.workflowSummary?.reviewOverdue ? '#d32f2f' : '#1565c0'}
            icon={<MonitorHeartIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Attention Required"
            value={fmtNum(kpi?.workflowSummary?.attentionRequired)}
            subtitle="active workflow exceptions"
            accent={kpi?.workflowSummary?.attentionRequired ? '#ed6c02' : '#2e7d32'}
            icon={<SecurityIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Booked Today"
            value={fmtNum(kpi?.workflowSummary?.bookedToday)}
            subtitle={kpi?.workflowSummary ? `${fmtNum(kpi.workflowSummary.autoBooked)} auto / ${fmtNum(kpi.workflowSummary.manualBooked)} manual` : 'workflow completions'}
            accent="#2e7d32"
            icon={<AssessmentIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Waitlist Fallbacks"
            value={fmtNum(kpi?.workflowSummary?.waitlistFallbacks)}
            subtitle="7-day operational follow-up"
            accent={kpi?.workflowSummary?.waitlistFallbacks ? '#ef6c00' : '#757575'}
            icon={<NotificationsActiveIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Average Review Time"
            value={kpi?.workflowSummary?.averageReviewMinutes != null ? `${kpi.workflowSummary.averageReviewMinutes.toFixed(1)}m` : '—'}
            subtitle="clinician approval turnaround"
            accent="#6a1b9a"
            icon={<PsychologyIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Closed-Loop Automation"
            value={automationRatePct !== null ? `${automationRatePct}%` : '—'}
            subtitle="encounter + revenue completion"
            accent={automationRatePct !== null && automationRatePct >= 80 ? '#2e7d32' : automationRatePct !== null && automationRatePct >= 60 ? '#ed6c02' : '#d32f2f'}
            icon={<AssessmentIcon />}
            progress={automationRatePct ?? undefined}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Revenue Health ────────────────────────────────────────────────── */}
      <SectionHeader title="Revenue Cycle Health" accent="#e65100" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Open Claim Denials"
            value={fmtNum(kpi?.denials?.openCount)}
            subtitle="requires action"
            accent={kpi?.denials?.openCount != null && kpi.denials.openCount > 20 ? '#d32f2f' : '#e65100'}
            icon={<GavelIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Claim Overturn Rate"
            value={kpi?.denials?.overTurnRate != null ? fmtPct(kpi.denials.overTurnRate) : '—'}
            subtitle="successfully appealed"
            accent="#2e7d32"
            icon={<AssessmentIcon />}
            progress={kpi?.denials?.overTurnRate != null ? Math.round(kpi.denials.overTurnRate * 100) : undefined}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Near Deadline"
            value={fmtNum(kpi?.denials?.nearDeadlineCount)}
            subtitle="appeal deadlines ≤ 30 days"
            accent={kpi?.denials?.nearDeadlineCount != null && kpi.denials.nearDeadlineCount > 0 ? '#d32f2f' : '#757575'}
            icon={<SecurityIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Engagement & Notifications ────────────────────────────────────── */}
      <SectionHeader title="Engagement & Notifications" accent="#00838f" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Notification Delivery Rate"
            value={deliveryRatePct !== null ? `${deliveryRatePct}%` : '—'}
            subtitle={kpi?.delivery ? `${fmtNum(kpi.delivery.delivered)} delivered / ${fmtNum(kpi.delivery.total)} total` : ''}
            accent={deliveryRatePct !== null && deliveryRatePct >= 95 ? '#2e7d32' : deliveryRatePct !== null && deliveryRatePct >= 80 ? '#ed6c02' : '#d32f2f'}
            icon={<NotificationsActiveIcon />}
            progress={deliveryRatePct ?? undefined}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Active Campaigns"
            value={activeCampaigns !== null ? activeCampaigns : '—'}
            subtitle={kpi?.campaigns ? `${fmtNum(kpi.campaigns.length)} campaigns total` : 'outreach campaigns'}
            accent="#00838f"
            icon={<CampaignIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KpiCard
            title="Messages Failed (30d)"
            value={kpi?.delivery?.failed != null ? fmtNum(kpi.delivery.failed) : '—'}
            subtitle={kpi?.delivery?.failureRate != null ? `failure rate: ${fmtPct(kpi.delivery.failureRate)}` : ''}
            accent={kpi?.delivery?.failureRate != null && kpi.delivery.failureRate > 0.1 ? '#d32f2f' : '#757575'}
            icon={<MonitorHeartIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Demo & GTM ───────────────────────────────────────────────────── */}
      <SectionHeader title="Go-to-Market & AI Adoption" accent="#6a1b9a" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Demo Sessions"
            value={fmtNum(kpi?.demoSessions?.length)}
            subtitle="total prospect demos"
            accent="#6a1b9a"
            icon={<SlideshowIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Demos Completed"
            value={fmtNum(completedDemos)}
            subtitle="full walkthrough completion"
            accent="#4a148c"
            icon={<SlideshowIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Average NPS Score"
            value={avgNps !== null ? avgNps : '—'}
            subtitle="net promoter score (0–10)"
            accent={avgNps !== null && parseFloat(avgNps) >= 8 ? '#2e7d32' : avgNps !== null && parseFloat(avgNps) >= 6 ? '#ed6c02' : '#d32f2f'}
            icon={<ThumbUpAltIcon />}
            progress={avgNps !== null ? Math.round(parseFloat(avgNps) * 10) : undefined}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="AI Feedback Positive"
            value={kpi?.feedback ? `${fmtNum(kpi.feedback.positiveCount)} / ${fmtNum(kpi.feedback.totalFeedback)}` : '—'}
            subtitle="clinician satisfaction (30d)"
            accent="#1b5e20"
            icon={<ThumbUpAltIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Status chips summary ─────────────────────────────────────────── */}
      {!loading && kpi && (
        <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`${fmtNum(kpi.tenantCount)} tenants`}
            size="small"
            color="primary"
            variant="outlined"
          />
          {kpi.denials?.nearDeadlineCount != null && kpi.denials.nearDeadlineCount > 0 && (
            <Chip
              label={`${kpi.denials.nearDeadlineCount} denials near deadline`}
              size="small"
              color="error"
            />
          )}
          {kpi.workflowSummary?.reviewOverdue != null && kpi.workflowSummary.reviewOverdue > 0 && (
            <Chip
              label={`${kpi.workflowSummary.reviewOverdue} workflow reviews overdue`}
              size="small"
              color="error"
            />
          )}
          {kpi.workflowSummary?.waitlistFallbacks != null && kpi.workflowSummary.waitlistFallbacks > 0 && (
            <Chip
              label={`${kpi.workflowSummary.waitlistFallbacks} waitlist fallbacks this week`}
              size="small"
              color="warning"
            />
          )}
          {deliveryRatePct !== null && deliveryRatePct < 80 && (
            <Chip
              label="Notification delivery low"
              size="small"
              color="warning"
            />
          )}
          {activeModels !== null && activeModels > 0 && (
            <Chip
              label={`${activeModels} AI model${activeModels > 1 ? 's' : ''} active`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          )}
        </Box>
      )}
    </Box>
  );
}
