import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { WhatsNewPanel, RELEASES, CURRENT_VERSION, countUnseenFeatures, useWhatsNewBadge } from './WhatsNewPanel';

vi.mock('@healthcare/design-system', () => ({
  SkeletonStatGrid: () => null,
}));

const SEEN_KEY = 'hq:whats-new-seen';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderPanel(open = true, onClose = vi.fn()) {
  return render(<WhatsNewPanel open={open} onClose={onClose} />);
}

describe('WhatsNewPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel(false);
    expect(screen.queryByLabelText("What's new panel")).not.toBeInTheDocument();
  });

  it('renders the panel heading when open', () => {
    renderPanel();
    expect(screen.getByLabelText("What's new panel")).toBeInTheDocument();
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it('displays the current release version chip', () => {
    renderPanel();
    expect(screen.getByText(CURRENT_VERSION)).toBeInTheDocument();
  });

  it('lists the current release title', () => {
    renderPanel();
    expect(screen.getByText('Go-Live Readiness')).toBeInTheDocument();
  });

  it('lists feature titles from all releases', () => {
    renderPanel();
    // Phase 38 features
    expect(screen.getByText('404 Not Found page')).toBeInTheDocument();
    expect(screen.getByText('Onboarding Wizard')).toBeInTheDocument();
    // Phase 37 features
    expect(screen.getByText('Offline Indicator')).toBeInTheDocument();
    expect(screen.getByText('Contextual Help')).toBeInTheDocument();
  });

  it('marks current version as seen when opened', () => {
    renderPanel();
    expect(localStorage.getItem(SEEN_KEY)).toBe(CURRENT_VERSION);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderPanel(true, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close what\'s new panel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Got it button is clicked', () => {
    const onClose = vi.fn();
    renderPanel(true, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Got it, close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ── countUnseenFeatures unit tests ───────────────────────────────────────────

describe('countUnseenFeatures', () => {
  it('returns total feature count when nothing has been seen', () => {
    const total = RELEASES.reduce((acc, r) => acc + r.features.length, 0);
    expect(countUnseenFeatures()).toBe(total);
  });

  it('returns 0 when current version already seen', () => {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
    expect(countUnseenFeatures()).toBe(0);
  });

  it('returns features from unseen releases only', () => {
    // Mark v37 as seen → only v38 features are unseen
    localStorage.setItem(SEEN_KEY, 'v37');
    const v38Features = RELEASES.find(r => r.version === 'v38')!.features.length;
    expect(countUnseenFeatures()).toBe(v38Features);
  });
});

// ── useWhatsNewBadge hook tests ───────────────────────────────────────────────

describe('useWhatsNewBadge', () => {
  it('returns total unseen count when nothing has been seen', () => {
    const total = RELEASES.reduce((acc, r) => acc + r.features.length, 0);
    const { result } = renderHook(() => useWhatsNewBadge());
    expect(result.current).toBe(total);
  });

  it('returns 0 when current version is already seen', () => {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
    const { result } = renderHook(() => useWhatsNewBadge());
    expect(result.current).toBe(0);
  });
});
