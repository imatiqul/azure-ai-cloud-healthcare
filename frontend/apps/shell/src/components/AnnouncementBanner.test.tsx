import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── No design-system import in AnnouncementBanner — no mock needed ───────────

// ── localStorage helpers ──────────────────────────────────────────────────────

const DISMISSED_KEY = 'hq:announcements-dismissed';
const BANNERS_KEY   = 'hq:announcements';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

import { AnnouncementBanner, type Announcement } from './AnnouncementBanner';

function seedBanners(banners: Announcement[]) {
  localStorage.setItem(BANNERS_KEY, JSON.stringify(banners));
}

function renderBanner() {
  return render(<AnnouncementBanner />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AnnouncementBanner', () => {
  it('renders nothing when all banners dismissed', () => {
    seedBanners([{ id: 'b1', severity: 'info', title: 'Hi', message: 'Msg' }]);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(['b1']));
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('shows an info banner with title and message', () => {
    seedBanners([{ id: 'b1', severity: 'info', title: 'Hello', message: 'World' }]);
    renderBanner();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('shows a warning banner', () => {
    seedBanners([{ id: 'b2', severity: 'warning', title: 'Warning', message: 'Heads up!' }]);
    renderBanner();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Heads up!')).toBeInTheDocument();
  });

  it('dismisses banner on close and hides it', () => {
    seedBanners([{ id: 'b3', severity: 'info', title: 'News', message: 'Something new' }]);
    renderBanner();
    expect(screen.getByText('News')).toBeInTheDocument();
    // MUI Alert close button aria-label
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('News')).not.toBeInTheDocument();
  });

  it('persists dismiss to localStorage', () => {
    seedBanners([{ id: 'b4', severity: 'info', title: 'Dismiss Me', message: 'x' }]);
    renderBanner();
    fireEvent.click(screen.getByLabelText('Close'));
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    expect(stored).toContain('b4');
  });

  it('renders multiple banners', () => {
    seedBanners([
      { id: 'a', severity: 'info',    title: 'Banner A', message: 'msg a' },
      { id: 'b', severity: 'warning', title: 'Banner B', message: 'msg b' },
    ]);
    renderBanner();
    expect(screen.getByText('Banner A')).toBeInTheDocument();
    expect(screen.getByText('Banner B')).toBeInTheDocument();
  });

  it('hides expired banners', () => {
    seedBanners([{ id: 'e1', severity: 'error', title: 'Old', message: 'expired', expiresAt: '2000-01-01T00:00:00Z' }]);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('seeds demo banners on first visit (no existing data)', () => {
    // No banners seeded — component seeds defaults
    renderBanner();
    // Default seed has "New: Pinned Pages" banner
    expect(screen.getByText(/New: Pinned Pages/i)).toBeInTheDocument();
  });
});
