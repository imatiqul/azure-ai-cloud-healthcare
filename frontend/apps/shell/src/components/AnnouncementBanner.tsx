/**
 * AnnouncementBanner — dismissible system announcements shown below TopNav.
 *
 * Banners are seeded into localStorage on first visit.
 * Each banner has a unique `id`; dismissal is tracked per-id so different
 * banners are independent.  Dismissed state survives page reload.
 *
 * Storage key (dismissed set): 'hq:announcements-dismissed'
 * Storage key (banners):       'hq:announcements'
 */
import { useState, useEffect } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Collapse from '@mui/material/Collapse';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Announcement {
  id:        string;
  severity:  'info' | 'warning' | 'error' | 'success';
  title:     string;
  message:   string;
  expiresAt?: string; // ISO date — hide after this date
}

// ── Demo seed banners ─────────────────────────────────────────────────────────

const SEED_BANNERS: Announcement[] = [
  {
    id:       'phase-36-release',
    severity: 'info',
    title:    'New: Pinned Pages & Quick Actions',
    message:  'Star any page in the sidebar to pin it to your Dashboard. Use the ➕ button to jump to common workflows instantly.',
  },
  {
    id:       'maintenance-window',
    severity: 'warning',
    title:    'Scheduled Maintenance',
    message:  'Platform maintenance is scheduled for Sunday 02:00–04:00 UTC. Some features may be temporarily unavailable.',
    expiresAt: '2099-01-01T00:00:00Z', // far future for demo
  },
];

// ── Storage helpers ───────────────────────────────────────────────────────────

const DISMISSED_KEY = 'hq:announcements-dismissed';
const BANNERS_KEY   = 'hq:announcements';

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function loadBanners(): Announcement[] {
  // Seed on first visit
  if (!localStorage.getItem(BANNERS_KEY)) {
    localStorage.setItem(BANNERS_KEY, JSON.stringify(SEED_BANNERS));
  }
  try {
    return JSON.parse(localStorage.getItem(BANNERS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function isExpired(banner: Announcement): boolean {
  if (!banner.expiresAt) return false;
  return new Date(banner.expiresAt) < new Date();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnouncementBanner() {
  const [banners,   setBanners]   = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBanners(loadBanners());
    setDismissed(loadDismissed());
  }, []);

  const dismiss = (id: string) => {
    const updated = new Set(dismissed).add(id);
    setDismissed(updated);
    saveDismissed(updated);
  };

  const visible = banners.filter(b => !dismissed.has(b.id) && !isExpired(b));

  if (visible.length === 0) return null;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5 }} data-testid="announcement-banner">
      <Stack spacing={1}>
        {visible.map(banner => (
          <Collapse key={banner.id} in timeout="auto" unmountOnExit>
            <Alert
              severity={banner.severity}
              onClose={() => dismiss(banner.id)}
              sx={{ borderRadius: 2 }}
            >
              {banner.title && <AlertTitle sx={{ fontWeight: 700 }}>{banner.title}</AlertTitle>}
              {banner.message}
            </Alert>
          </Collapse>
        ))}
      </Stack>
    </Box>
  );
}
