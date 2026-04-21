import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Design system mock ────────────────────────────────────────────────────────

vi.mock('@healthcare/design-system', () => ({
  Card:        ({ children, sx }: any) => <div data-testid="card" style={sx}>{children}</div>,
  CardHeader:  ({ children }: any) => <div>{children}</div>,
  CardTitle:   ({ children }: any) => <span>{children}</span>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  Button:      ({ children, onClick, 'aria-label': ariaLabel }: any) => (
    <button onClick={onClick} aria-label={ariaLabel}>{children}</button>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

import UserPreferencesPanel, { loadPreferences, type UserPreferences } from './UserPreferencesPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <UserPreferencesPanel />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserPreferencesPanel', () => {
  it('renders the Preferences heading', () => {
    renderPanel();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
  });

  it('renders navigation, display and notifications sections', () => {
    renderPanel();
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders Save Preferences, Reset to Defaults and Cancel buttons', () => {
    renderPanel();
    expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    expect(screen.getByText('Reset to Defaults')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('saves preferences to localStorage and shows success alert', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Save Preferences'));
    expect(screen.getByText('Preferences saved successfully.')).toBeInTheDocument();
    const stored = localStorage.getItem('hq:prefs');
    expect(stored).not.toBeNull();
  });

  it('reset restores defaults and shows success alert', () => {
    // First dirty the prefs
    localStorage.setItem('hq:prefs', JSON.stringify({ soundAlerts: false }));
    renderPanel();
    fireEvent.click(screen.getByText('Reset to Defaults'));
    expect(screen.getByText('Preferences saved successfully.')).toBeInTheDocument();
    const saved: Partial<UserPreferences> = JSON.parse(localStorage.getItem('hq:prefs')!);
    expect(saved.soundAlerts).toBe(true);
  });

  it('Cancel calls navigate(-1)', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('loadPreferences returns defaults when nothing stored', () => {
    const prefs = loadPreferences();
    expect(prefs.defaultLandingPage).toBe('/');
    expect(prefs.compactSidebar).toBe(false);
    expect(prefs.soundAlerts).toBe(true);
    expect(prefs.rowsPerPage).toBe(25);
    expect(prefs.dateFormat).toBe('Relative');
  });

  it('loadPreferences merges stored overrides with defaults', () => {
    localStorage.setItem('hq:prefs', JSON.stringify({ soundAlerts: false, rowsPerPage: 50 }));
    const prefs = loadPreferences();
    expect(prefs.soundAlerts).toBe(false);
    expect(prefs.rowsPerPage).toBe(50);
    expect(prefs.defaultLandingPage).toBe('/'); // still default
  });
});
