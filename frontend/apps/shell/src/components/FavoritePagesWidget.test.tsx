import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Design system mock (required — prevents @mui/lab/Timeline resolution errors) ──

vi.mock('@healthcare/design-system', () => ({
  Card:        ({ children, sx }: any) => <div data-testid="card" style={sx}>{children}</div>,
  CardHeader:  ({ children }: any) => <div>{children}</div>,
  CardTitle:   ({ children }: any) => <span>{children}</span>,
  CardContent: ({ children, sx }: any) => <div style={sx}>{children}</div>,
  Button:      ({ children, onClick, 'aria-label': ariaLabel }: any) => (
    <button onClick={onClick} aria-label={ariaLabel}>{children}</button>
  ),
}));

// ── useFavorites mock ─────────────────────────────────────────────────────────

let mockFavorites: string[] = [];

vi.mock('../hooks/useFavorites', () => ({
  loadFavorites: () => [...mockFavorites],
  isFavorite:    (href: string) => mockFavorites.includes(href),
  toggleFavorite: (href: string) => {
    const idx = mockFavorites.indexOf(href);
    if (idx === -1) {
      mockFavorites = [...mockFavorites, href];
      return true;
    } else {
      mockFavorites = mockFavorites.filter(h => h !== href);
      return false;
    }
  },
}));

import { FavoritePagesWidget, FavoriteStar } from './FavoritePagesWidget';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWidget(initialRoutes: string[] = [], path = '/') {
  mockFavorites = [...initialRoutes];
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FavoritePagesWidget />
    </MemoryRouter>,
  );
}

function renderStar(href: string, label: string, pinned = false) {
  mockFavorites = pinned ? [href] : [];
  return render(
    <MemoryRouter>
      <FavoriteStar href={href} label={label} />
    </MemoryRouter>,
  );
}

// ── FavoritePagesWidget tests ─────────────────────────────────────────────────

describe('FavoritePagesWidget', () => {
  beforeEach(() => {
    mockFavorites = [];
  });

  it('renders nothing when no favorites', () => {
    const { container } = renderWidget([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders Pinned Pages card when favorites exist', () => {
    renderWidget(['/triage', '/scheduling']);
    expect(screen.getByText('Pinned Pages')).toBeInTheDocument();
  });

  it('shows label for known href', () => {
    renderWidget(['/triage']);
    expect(screen.getByText('Triage')).toBeInTheDocument();
  });

  it('shows raw href as label for unknown route', () => {
    renderWidget(['/unknown-route']);
    expect(screen.getByText('/unknown-route')).toBeInTheDocument();
  });

  it('navigates on click', () => {
    renderWidget(['/triage']);
    const row = screen.getByText('Triage').closest('[role="button"]')!;
    fireEvent.click(row);
    // navigation attempted — no crash
  });

  it('navigates on Enter keydown', () => {
    renderWidget(['/triage']);
    const row = screen.getByText('Triage').closest('[role="button"]')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    // no crash
  });

  it('unpin removes the page from the list', () => {
    renderWidget(['/triage']);
    expect(screen.getByText('Triage')).toBeInTheDocument();
    const unpinBtn = screen.getByRole('button', { name: 'Unpin Triage' });
    fireEvent.click(unpinBtn);
    expect(screen.queryByText('Triage')).not.toBeInTheDocument();
  });

  it('renders multiple favorites', () => {
    renderWidget(['/triage', '/scheduling', '/revenue']);
    expect(screen.getByText('Triage')).toBeInTheDocument();
    expect(screen.getByText('Scheduling')).toBeInTheDocument();
    expect(screen.getByText('Revenue Cycle')).toBeInTheDocument();
  });
});

// ── FavoriteStar tests ────────────────────────────────────────────────────────

describe('FavoriteStar', () => {
  beforeEach(() => {
    mockFavorites = [];
  });

  it('renders an icon button', () => {
    renderStar('/triage', 'Triage');
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows "Pin Triage" aria-label when not pinned', () => {
    renderStar('/triage', 'Triage', false);
    expect(screen.getByRole('button', { name: 'Pin Triage' })).toBeInTheDocument();
  });

  it('shows "Unpin Triage" aria-label when pinned', () => {
    renderStar('/triage', 'Triage', true);
    expect(screen.getByRole('button', { name: 'Unpin Triage' })).toBeInTheDocument();
  });

  it('toggles to pinned on click', async () => {
    renderStar('/triage', 'Triage', false);
    const btn = screen.getByRole('button', { name: 'Pin Triage' });
    await act(async () => { fireEvent.click(btn); });
    expect(screen.getByRole('button', { name: 'Unpin Triage' })).toBeInTheDocument();
  });

  it('toggles to unpinned on click when already pinned', async () => {
    renderStar('/triage', 'Triage', true);
    const btn = screen.getByRole('button', { name: 'Unpin Triage' });
    await act(async () => { fireEvent.click(btn); });
    expect(screen.getByRole('button', { name: 'Pin Triage' })).toBeInTheDocument();
  });
});
