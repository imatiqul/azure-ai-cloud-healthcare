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

export const CURRENT_VERSION = 'v51';
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
