import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PushSubscriptionPanel } from './PushSubscriptionPanel';

const mockSubs = [
  { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/push/abc', createdAt: '2026-04-01T10:00:00Z' },
  { id: 'sub-2', endpoint: 'https://push.mozilla.com/push/xyz', createdAt: '2026-04-10T09:00:00Z' },
];

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('PushSubscriptionPanel', () => {
  it('renders the heading', () => {
    render(<PushSubscriptionPanel />);
    expect(screen.getByText('Web Push Subscriptions')).toBeInTheDocument();
  });

  it('fetches subscriptions on patient search', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubs),
    });

    render(<PushSubscriptionPanel />);
    await user.type(screen.getByLabelText('Patient ID'), 'patient-001');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/notifications/push-subscriptions?patientId=patient-001'),
      );
    });
  });

  it('shows subscription endpoints', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSubs),
    });

    render(<PushSubscriptionPanel />);
    await user.type(screen.getByLabelText('Patient ID'), 'patient-001');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText(/fcm\.googleapis\.com/)).toBeInTheDocument();
      expect(screen.getByText(/push\.mozilla\.com/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no subscriptions', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<PushSubscriptionPanel />);
    await user.type(screen.getByLabelText('Patient ID'), 'patient-002');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText(/No active push subscriptions/)).toBeInTheDocument();
    });
  });

  it('DELETEs subscription on unregister click', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSubs) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mockSubs[1]]) });

    render(<PushSubscriptionPanel />);
    await user.type(screen.getByLabelText('Patient ID'), 'patient-001');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => screen.getByLabelText('unregister sub-1'));
    await user.click(screen.getByLabelText('unregister sub-1'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/notifications/push-subscriptions/sub-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('POSTs to push-subscriptions on register', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSubs) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'sub-3', patientId: 'patient-001', createdAt: '2026-04-20T00:00:00Z' }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSubs) });

    render(<PushSubscriptionPanel />);
    await user.type(screen.getByLabelText('Patient ID'), 'patient-001');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => screen.getByRole('button', { name: '+ Register' }));

    await user.click(screen.getByRole('button', { name: '+ Register' }));
    await user.type(screen.getByLabelText('Endpoint URL'), 'https://fcm.googleapis.com/new');
    await user.type(screen.getByLabelText('P256DH Key'), 'base64key==');
    await user.type(screen.getByLabelText('Auth Secret'), 'authsecret==');

    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/notifications/push-subscriptions'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
