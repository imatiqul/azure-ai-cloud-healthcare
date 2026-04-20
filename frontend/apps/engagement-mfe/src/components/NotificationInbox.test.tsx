import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationInbox } from './NotificationInbox';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationInbox', () => {
  it('shows loading then renders messages', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'msg-1',
              campaignId: 'camp-00000001',
              channel: 'email',
              status: 'delivered',
              createdAt: '2025-05-01T12:00:00Z',
            },
            {
              id: 'msg-2',
              campaignId: 'camp-00000002',
              channel: 'sms',
              status: 'pending',
              createdAt: '2025-05-02T08:00:00Z',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<NotificationInbox patientId="pat-1" />);
    expect(screen.getByText(/Loading notifications/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('email')).toBeInTheDocument();
    });
    expect(screen.getByText('sms')).toBeInTheDocument();
    expect(screen.getByText(/Campaign #camp-000/)).toBeInTheDocument();
  });

  it('shows empty state when no messages', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<NotificationInbox patientId="pat-2" />);

    await waitFor(() => {
      expect(screen.getByText(/No notifications for this patient/)).toBeInTheDocument();
    });
  });

  it('shows error on fetch failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    render(<NotificationInbox patientId="pat-3" />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
    });
  });

  it('passes patientId in query string', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<NotificationInbox patientId="special-patient" />);

    await waitFor(() => {
      expect(screen.getByText(/No notifications/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('patientId=special-patient')
    );
  });
});
