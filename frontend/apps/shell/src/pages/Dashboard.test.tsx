import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { useGlobalStore } from '../store';

// SignalR resolves /hubs/global which is unavailable in jsdom — stub it out
vi.mock('@healthcare/signalr-client', () => ({
  createGlobalHub: () => ({
    start:  vi.fn(() => Promise.resolve()),
    stop:   vi.fn(() => Promise.resolve()),
    on:     vi.fn(),
    off:    vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => ({
      'dashboard.title':            'Dashboard',
      'dashboard.pendingTriage':    'Pending Triage',
      'dashboard.triageCompleted':  'Triage Completed',
      'dashboard.availableSlots':   'Available Slots Today',
      'dashboard.bookedToday':      'Booked Today',
      'dashboard.highRiskPatients': 'High-Risk Patients',
      'dashboard.openCareGaps':     'Open Care Gaps',
      'dashboard.codingQueue':      'Coding Queue',
      'dashboard.priorAuthPending': 'Prior Auths Pending',
    } as Record<string, string>)[key] ?? fallback ?? key,
  }),
}));

// mock stat data — keys must match what buildStats destructures (camelCase)
const mockStats = {
  agents:     { pendingTriage: 3, awaitingReview: 1, completed: 12 },
  scheduling: { availableToday: 18, bookedToday: 5 },
  popHealth:  { highRiskPatients: 2, openCareGaps: 6 },
  revenue:    { codingQueue: 8, priorAuthsPending: 4 },
};

beforeEach(() => {
  vi.restoreAllMocks();
  useGlobalStore.setState({ backendOnline: true });
  global.fetch = vi.fn((url: string) => {
    if (url.includes('agents/stats'))          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats.agents) });
    if (url.includes('scheduling/stats'))       return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats.scheduling) });
    if (url.includes('population-health/stats'))return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats.popHealth) });
    if (url.includes('revenue/stats'))          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats.revenue) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  }) as unknown as typeof fetch;
});

describe('Dashboard', () => {
  it('renders the heading', async () => {
    render(<Dashboard />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows skeleton loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<Dashboard />);
    // While loading, stat labels should not be visible yet
    expect(screen.queryByText('Pending Triage')).not.toBeInTheDocument();
  });

  it('displays stats after loading', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Pending Triage')).toBeInTheDocument();
    });
    expect(screen.getByText('Triage Completed')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Available Slots Today')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Coding Queue')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders 8 stat cards', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Pending Triage')).toBeInTheDocument();
    });
    const labels = [
      'Pending Triage', 'Triage Completed', 'Available Slots Today', 'Booked Today',
      'High-Risk Patients', 'Open Care Gaps', 'Coding Queue', 'Prior Auths Pending',
    ];
    labels.forEach(label => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
  });

  it('handles fetch errors gracefully', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false })) as unknown as typeof fetch;
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Pending Triage')).toBeInTheDocument();
    });
    // Fallback values should all be 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(8);
  });
});
