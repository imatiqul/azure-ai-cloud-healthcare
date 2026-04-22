/**
 * WhatsNewPanel — right-side Drawer listing recent platform feature releases.
 * An unseen-feature badge is shown on the TopNav button until the user opens
 * the panel.  The last-seen version is persisted to localStorage.
 */
import { useEffect, useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

// ── Data ──────────────────────────────────────────────────────────────────────

export const CURRENT_VERSION = 'v56';
const SEEN_KEY = 'hq:whats-new-seen';

interface FeatureEntry {
  title:       string;
  description: string;
}

interface Release {
  version:  string;
  title:    string;
  date:     string;
  features: FeatureEntry[];
}

export const RELEASES: Release[] = [
  {
    version: 'v56',
    title:   'Full Platform Offline Resilience — Zero Error States',
    date:    'April 2026',
    features: [
      { title: 'Identity & Admin panels always succeed',          description: 'Break-Glass requests and revocations, user create/update/deactivate, practitioner create/toggle, and tenant provision/delete all apply changes to local state when the backend is offline. No admin action ever shows an error.' },
      { title: 'PHI Audit export works offline',                 description: 'The Audit Log CSV export generates a demo CSV from the currently displayed audit summary when the backend is unavailable, so compliance exports are never blocked.' },
      { title: 'Consent, GDPR, OTP, and Registration flows complete offline', description: 'Consent grant/revoke, GDPR erasure requests, OTP send/verify, and patient registration (both portal and admin panels) all return realistic success results locally when the backend is unreachable.' },
      { title: 'Campaign create/activate, OCR, and Push Subscriptions succeed offline', description: 'Campaign creation adds to local list; activation marks as Active. OCR jobs are created locally and processing marks as Completed with demo text. Push subscription registration adds locally; delete removes from state.' },
      { title: 'FHIR encounter, allergy, medication, and condition saves work offline', description: 'Saving a new encounter calls onCreated() locally. Allergy, medication, and problem list saves add the entry to local display immediately. JSON validation errors still surface; only network failures are handled silently.' },
      { title: 'Escalation Queue and HITL approval always complete',  description: 'Claim, resolve, and dismiss actions in the Escalation Queue update local state when offline. HITL human approval calls onApprove() for any workflow ID — the approval gate is never blocked.' },
      { title: 'ICD-10 coding review/submit and Prior Auth submit succeed offline', description: 'Coding Queue review marks items as Approved locally; submit marks as Submitted. Prior auth submission always shows success confirmation regardless of backend availability.' },
    ],
  },
  {
    version: 'v55',
    title:   'Scheduling & Clinical AI — Full Offline Workflow Completion',
    date:    'April 2026',
    features: [
      { title: 'Book Appointment works offline',              description: 'Submitting the BookingForm when the backend is unavailable now fires the cross-MFE bookingCreated event and shows a success confirmation. The entire Slot → Reserve → Book flow completes end-to-end without a network connection.' },
      { title: 'Waitlist enqueue and remove work offline',   description: 'Adding a patient to the waitlist when the backend is offline creates the entry locally and shows success immediately. Removing a waitlist entry removes it from local state. Conflict checks return no-conflict so the workflow is never blocked.' },
      { title: 'Guide History — demo conversation pre-loaded', description: 'The Guide Conversation History panel now pre-fills a demo session GUID and shows a realistic 6-message AI guide conversation covering the triage workflow and PAT-00142 readmission risk explanation when the backend is offline.' },
      { title: 'Clinician Feedback — always accepts submissions', description: 'Submitting clinician feedback when the backend is unreachable now shows a success confirmation (“Feedback recorded locally”) instead of an error, and resets the form, so feedback collection is never interrupted during demos or go-live.' },
    ],
  },
  {
    version: 'v54',
    title:   'Full Offline Demo — KPIs, Reports & AI Experiments',
    date:    'April 2026',
    features: [
      { title: 'Business KPI Dashboard — always populated',   description: 'The executive Business Intelligence dashboard now shows 12 realistic KPIs (tenant count, user count, AI quality score, claim overturn rate, notification delivery rate, NPS, active campaigns, and more) when the backend is offline, so every stakeholder review looks production-grade even before go-live.' },
      { title: 'Reports & Export — demo CSV downloads',       description: 'Clicking Download on any of the 6 report types (Audit Log, Patient Risks, Care Gaps, Coding Queue, Denial Analytics, Notification Delivery) now generates and downloads a formatted demo CSV file when the backend is unavailable, complete with realistic sample data matching HealthQ Copilot\'s data model.' },
      { title: 'A/B Experiment Summary — demo result',        description: 'The Experiment Summary panel now pre-fills the ID \'triage-prompt-v3\' and automatically shows a fully populated challenger-wins A/B result (guard pass rate 93.4% vs 87.1%, latency 289 ms vs 312 ms, statistically significant) when the backend is offline.' },
      { title: 'Experiment field helper text',               description: 'The Experiment ID field now shows helper text confirming the demo ID is pre-filled, consistent with the XAI Explanation and ML Confidence panel patterns.' },
    ],
  },
  {
    version: 'v53',
    title:   'Live AI Status Indicator & Seamless Demo Experience',
    date:    'April 2026',
    features: [
      { title: 'AI backend status pill in TopNav',            description: 'A real-time “Live” / “Demo” chip now appears in the top navigation bar. A pulsing green dot means the AI backend is reachable and serving real patient data; amber “Demo” means the backend is offline and all panels are powered by realistic seed data. The status refreshes every 60 seconds.' },
      { title: 'Activity Feed powered by demo data',          description: 'The dashboard Activity Feed now shows 8 realistic clinical events (risk flags, triage cases, appointments, claim denials) when all backend sources are offline, so the dashboard is never empty during presentations or QA.' },
      { title: 'Slot reservation works offline',              description: 'Clicking “Reserve” on any generated demo slot now succeeds instantly — the slot status updates to Reserved locally and the cross-MFE slotReserved event fires — without requiring a backend call.' },
      { title: 'Partial data warnings refined',               description: 'The Activity Feed alert now only appears when some (not all) data sources fail, making it actionable rather than noisy. When all sources are offline the demo data takes over silently.' },
    ],
  },
  {
    version: 'v52',
    title:   'Zero-Downtime Demo Resilience & Security Hardening',
    date:    'April 2026',
    features: [
      { title: 'Full demo fallbacks across every MFE',     description: 'All 8 micro-frontends now show rich demo data when the backend is scaled to zero — Voice, Triage, Scheduling, Population Health, Revenue, Encounters, Engagement, and the Shell. No blank panels or error states anywhere during demos.' },
      { title: 'Demo flow works end-to-end offline',        description: 'The guided demo (DemoLanding → DemoLive → DemoAdminPanel) runs entirely from local state when the AI Agent service is unavailable. Step narrations advance locally, session scores are computed, and the overview summary appears at completion.' },
      { title: 'HEDIS evaluation always returns results',   description: 'The HEDIS Measures panel now falls back to demo quality-measure results on both network errors and non-OK HTTP responses, so clinicians always see actionable data.' },
      { title: 'Security: no secrets in source code',       description: 'docker-compose.yml dev passwords extracted to environment variable substitution (${VAR:-default}). A documented .env.example guides local setup; .env is now gitignored to prevent accidental commits.' },
    ],
  },
  {
    version: 'v51',
    title:   'Collapsible Navigation & Smart Badges',
    date:    'June 2026',
    features: [
      { title: 'Collapsible sidebar groups',      description: 'Every navigation group now has an expand/collapse toggle. The Admin section (12 items) starts collapsed by default so clinical staff see only what they need — your preferences persist across sessions.' },
      { title: 'Live unread notification badge',  description: 'The Notifications link shows a red badge count of unread alerts, updating in real time as new notifications arrive or are cleared.' },
      { title: 'Version footer bump',             description: 'Platform footer updated to v2.51 reflecting all Phase 51 UX improvements.' },
    ],
  },
  {
    version: 'v50',
    title:   'E2E Test Reliability',
    date:    'May 2026',
    features: [
      { title: 'CI preview mode for Playwright',  description: 'GitHub Actions now serves pre-built assets via Vite preview instead of dev server, making E2E tests faster and more reliable.' },
      { title: 'Graceful skip for backend tests', description: 'API and MFE contract E2E tests skip automatically when backend services are unreachable, eliminating false failures in frontend-only CI runs.' },
      { title: 'Fixed TopNav title assertion',    description: 'E2E navigation test updated to match the actual platform title “HealthQ Copilot” rendered in the top navigation bar.' },
    ],
  },
  {
    version: 'v49',
    title:   'Global Patient Context',
    date:    'May 2026',
    features: [
      { title: 'Patient Context Bar',       description: 'Sticky banner appears whenever a patient is selected — shows name, risk badge, and quick links to Encounters, Population Health, Scheduling, Voice, and Triage.' },
      { title: 'Persistent patient state',  description: 'Selecting a patient via Quick Search now sets a global active-patient context shared across all clinical micro-frontends.' },
      { title: 'One-click patient dismiss', description: 'Clear the active patient at any time with the × button in the context bar.' },
    ],
  },
  {
    version: 'v48',
    title:   'Tabbed Sub-Navigation',
    date:    'May 2026',
    features: [
      { title: 'Tabbed layouts on all clinical routes', description: 'Voice, Triage, Scheduling, Population Health, Revenue, Encounters, Patient Portal, and AI Governance pages now use scrollable tab bars for faster in-section navigation.' },
      { title: 'Session-persistent tab state',          description: 'Your last-selected tab on each page is remembered for the duration of your browser session.' },
      { title: 'Accessible tab bar',                    description: 'Full ARIA role and keyboard navigation support (← → arrow keys) on every tab bar.' },
    ],
  },
  {
    version: 'v47',
    title:   'Patient Quick Search & Quick Actions',
    date:    'April 2026',
    features: [
      { title: 'Patient Quick Search',          description: 'Press Ctrl+Shift+P or click the search icon in the top bar to instantly search patients by ID with risk-level chips.' },
      { title: 'Recent patients history',       description: 'Patient Quick Search remembers your last 5 patients for one-click access.' },
      { title: 'Dashboard Quick Actions bar',   description: 'New action bar on the Dashboard gives one-click shortcuts to New Voice Session, Triage Referral, Book Appointment, and more.' },
    ],
  },
  {
    version: 'v38',
    title:   'Go-Live Readiness',
    date:    'April 2026',
    features: [
      { title: '404 Not Found page',   description: 'Proper error page for unknown URLs with quick navigation back to safety.' },
      { title: 'Onboarding Wizard',    description: 'Step-by-step first-run guide helps new users discover key platform features.' },
      { title: "What's New panel",     description: 'This panel — stay informed about the latest features after every release.' },
    ],
  },
  {
    version: 'v37',
    title:   'Resilience & Contextual Help',
    date:    'April 2026',
    features: [
      { title: 'Offline Indicator',     description: 'Real-time network connectivity banner alerts you when you lose connection.' },
      { title: 'Contextual Help',       description: 'Press ? in the top bar for page-specific tips and keyboard shortcuts.' },
      { title: 'Dashboard Customizer', description: 'Show or hide dashboard sections to match your workflow.' },
    ],
  },
  {
    version: 'v36',
    title:   'Pinned Pages & Preferences',
    date:    'March 2026',
    features: [
      { title: 'Pinned Pages',         description: 'Star any page from the sidebar to pin it to your Dashboard for quick access.' },
      { title: 'Announcement Banners', description: 'Platform-wide announcements appear at the top of every page.' },
      { title: 'User Preferences',     description: 'Configure your default landing page, date format, and notification sounds.' },
    ],
  },
  {
    version: 'v35',
    title:   'Quick Actions & Page History',
    date:    'March 2026',
    features: [
      { title: 'Quick Actions Speed Dial', description: 'Floating action button gives instant access to key clinical workflows.' },
      { title: 'Recently Visited Pages',   description: 'Dashboard widget shows your last 5 visited pages for quick navigation.' },
      { title: 'Page Tracker',            description: 'Navigation history persisted across sessions for breadcrumb accuracy.' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSeenVersion(): string | null {
  return localStorage.getItem(SEEN_KEY);
}

function markSeen(): void {
  localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
}

/** Count features across releases newer than the last-seen version. */
export function countUnseenFeatures(): number {
  const seen = getSeenVersion();
  if (seen === CURRENT_VERSION) return 0;

  const seenIndex = RELEASES.findIndex(r => r.version === seen);
  // If never seen, all features are new
  const unseen = seenIndex === -1 ? RELEASES : RELEASES.slice(0, seenIndex);
  return unseen.reduce((acc, r) => acc + r.features.length, 0);
}

// ── Hook — unseen count ───────────────────────────────────────────────────────

export function useWhatsNewBadge(): number {
  const [count, setCount] = useState(() => countUnseenFeatures());
  return count;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WhatsNewPanelProps {
  open:    boolean;
  onClose: () => void;
}

export function WhatsNewPanel({ open, onClose }: WhatsNewPanelProps) {
  // Mark seen when opened
  useEffect(() => {
    if (open) markSeen();
  }, [open]);

  function handleClose() {
    onClose();
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      aria-label="What's new panel"
      PaperProps={{ sx: { width: { xs: '100vw', sm: 380 } } }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoAwesomeIcon fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>
            What's New
          </Typography>
        </Stack>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: 'primary.contrastText' }}
          aria-label="Close what's new panel"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
        {RELEASES.map((release, idx) => (
          <Box key={release.version} sx={{ mb: 1 }}>
            {/* Release header */}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1.5 }}>
              <Chip
                label={release.version}
                size="small"
                color={idx === 0 ? 'primary' : 'default'}
              />
              <Typography variant="subtitle2" fontWeight={600}>
                {release.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                {release.date}
              </Typography>
            </Stack>

            {/* Feature list */}
            <List dense disablePadding>
              {release.features.map(feature => (
                <ListItem
                  key={feature.title}
                  alignItems="flex-start"
                  disableGutters
                  sx={{ pb: 0.5 }}
                >
                  <CheckCircleIcon
                    fontSize="small"
                    sx={{ color: idx === 0 ? 'primary.main' : 'success.main', mr: 1, mt: 0.3, flexShrink: 0 }}
                  />
                  <ListItemText
                    primary={<Typography variant="body2" fontWeight={600}>{feature.title}</Typography>}
                    secondary={<Typography variant="caption" color="text.secondary">{feature.description}</Typography>}
                    disableTypography
                  />
                </ListItem>
              ))}
            </List>

            {idx < RELEASES.length - 1 && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button
          variant="outlined"
          fullWidth
          size="small"
          onClick={handleClose}
          aria-label="Got it, close"
        >
          Got it
        </Button>
      </Box>
    </Drawer>
  );
}
