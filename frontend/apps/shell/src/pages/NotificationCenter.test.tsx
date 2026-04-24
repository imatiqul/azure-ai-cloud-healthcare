import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import NotificationCenter from './NotificationCenter';
import { useGlobalStore } from '../store';

// NotificationCenter uses only MUI — no design-system mock needed

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useGlobalStore.setState({ backendOnline: true });
  // Default: all API calls fail gracefully
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationCenter />
    </MemoryRouter>
  );
}

describe('NotificationCenter', () => {
  it('renders heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Notification Center')).toBeInTheDocument();
    });
  });

  it('shows 0 unread and 0 total chips when no notifications', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Notification Center'));
    expect(screen.getByText('0 unread')).toBeInTheDocument();
    expect(screen.getByText('0 total')).toBeInTheDocument();
  });

  it('shows empty state when no notifications exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
    });
  });

  it('renders notifications loaded from localStorage', async () => {
    const record = {
      id: 'test-1',
      title: 'Claim Denial Alert',
      subtitle: '3 denials near deadline',
      severity: 'error',
      href: '/revenue',
      read: false,
      receivedAt: new Date().toISOString(),
    };
    localStorage.setItem('hq:notification-history', JSON.stringify([record]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Claim Denial Alert')).toBeInTheDocument();
    });
    expect(screen.getByText('1 unread')).toBeInTheDocument();
    expect(screen.getByText('1 total')).toBeInTheDocument();
  });

  it('mark all read button updates unread count to 0', async () => {
    const record = {
      id: 'test-mark',
      title: 'Test Alert',
      subtitle: 'Sub',
      severity: 'warning',
      href: '/revenue',
      read: false,
      receivedAt: new Date().toISOString(),
    };
    localStorage.setItem('hq:notification-history', JSON.stringify([record]));
    renderPage();
    await waitFor(() => screen.getByText('Test Alert'));

    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(screen.getByText('0 unread')).toBeInTheDocument();
  });

  it('clear history button shows empty state', async () => {
    const record = {
      id: 'test-clear',
      title: 'Clear Me',
      subtitle: 'Sub',
      severity: 'info',
      href: '/triage',
      read: false,
      receivedAt: new Date().toISOString(),
    };
    localStorage.setItem('hq:notification-history', JSON.stringify([record]));
    renderPage();
    await waitFor(() => screen.getByText('Clear Me'));

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));
    await waitFor(() => {
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
    });
  });

  it('clicking a notification marks it as read', async () => {
    const record = {
      id: 'test-click',
      title: 'Clickable Alert',
      subtitle: 'Sub',
      severity: 'warning',
      href: '/patient-portal',
      read: false,
      receivedAt: new Date().toISOString(),
    };
    localStorage.setItem('hq:notification-history', JSON.stringify([record]));
    renderPage();
    await waitFor(() => screen.getByText('Clickable Alert'));

    fireEvent.click(screen.getByText('Clickable Alert'));
    // Clicked → marked read → unread count goes to 0
    expect(screen.getByText('0 unread')).toBeInTheDocument();
  });

  it('shows refresh button', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Notification Center'));
    expect(screen.getByRole('button', { name: /refresh notifications/i })).toBeInTheDocument();
  });

  it('adds live alerts from API to notification history', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('denials/analytics')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ nearDeadlineCount: 3, openCount: 6, overTurnRate: 0.4 }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/3 claim denials near deadline/i)).toBeInTheDocument();
    });
  });

  it('severity filter chips are rendered', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Notification Center'));
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText(/Critical/)).toBeInTheDocument();
    expect(screen.getByText(/Warning/)).toBeInTheDocument();
    expect(screen.getByText(/Info/)).toBeInTheDocument();
    expect(screen.getByText('Unread only')).toBeInTheDocument();
  });

  it('severity filter hides non-matching notifications', async () => {
    const records = [
      { id: 'e1', title: 'Error Alert', subtitle: '', severity: 'error', href: '/', read: false, receivedAt: new Date().toISOString() },
      { id: 'w1', title: 'Warning Alert', subtitle: '', severity: 'warning', href: '/', read: false, receivedAt: new Date().toISOString() },
    ];
    localStorage.setItem('hq:notification-history', JSON.stringify(records));
    renderPage();
    await waitFor(() => screen.getByText('Error Alert'));

    // Click Warning filter — chip label includes count: "Warning (1)"
    fireEvent.click(screen.getByText('Warning (1)'));
    expect(screen.getByText('Warning Alert')).toBeInTheDocument();
    expect(screen.queryByText('Error Alert')).toBeNull();
  });

  it('Unread only filter hides read notifications', async () => {
    const records = [
      { id: 'r1', title: 'Read Alert', subtitle: '', severity: 'info', href: '/', read: true, receivedAt: new Date().toISOString() },
      { id: 'u1', title: 'Unread Alert', subtitle: '', severity: 'info', href: '/', read: false, receivedAt: new Date().toISOString() },
    ];
    localStorage.setItem('hq:notification-history', JSON.stringify(records));
    renderPage();
    await waitFor(() => screen.getByText('Unread Alert'));

    fireEvent.click(screen.getByText('Unread only'));
    expect(screen.getByText('Unread Alert')).toBeInTheDocument();
    expect(screen.queryByText('Read Alert')).toBeNull();
  });
});
