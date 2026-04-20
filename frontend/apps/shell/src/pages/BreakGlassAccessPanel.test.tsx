import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BreakGlassAccessPanel from './BreakGlassAccessPanel';

const futureExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

const mockAccesses = [
  {
    id: 'bg-001',
    requestedByUserId: 'user-111',
    targetPatientId: 'patient-222',
    clinicalJustification: 'Patient unresponsive, need emergency cardiac history',
    grantedAt: '2026-04-20T06:00:00Z',
    expiresAt: futureExpiry,
    isRevoked: false,
  },
  {
    id: 'bg-002',
    requestedByUserId: 'user-333',
    targetPatientId: 'patient-444',
    clinicalJustification: 'Post-surgery complication access required',
    grantedAt: '2026-04-19T14:00:00Z',
    expiresAt: '2026-04-19T18:00:00Z',
    isRevoked: false,
  },
];

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('BreakGlassAccessPanel', () => {
  it('renders heading', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(<BreakGlassAccessPanel />);
    expect(screen.getByText('Break-Glass Emergency Access')).toBeTruthy();
  });

  it('fetches break-glass records on mount', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccesses),
    });
    render(<BreakGlassAccessPanel />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/break-glass')
      );
    });
  });

  it('shows requesting user and target patient IDs', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccesses),
    });
    render(<BreakGlassAccessPanel />);
    await waitFor(() => {
      expect(screen.getByText('user-111')).toBeTruthy();
      expect(screen.getByText('patient-222')).toBeTruthy();
    });
  });

  it('shows Active badge for non-expired non-revoked record', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAccesses),
    });
    render(<BreakGlassAccessPanel />);
    await waitFor(() => {
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state alert when no records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(<BreakGlassAccessPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no break-glass access records found/i)).toBeTruthy();
    });
  });

  it('Request Access button opens dialog with required fields', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    const user = userEvent.setup();
    render(<BreakGlassAccessPanel />);
    await user.click(screen.getByText('Request Access'));
    expect(screen.getByText('Request Break-Glass Emergency Access')).toBeTruthy();
    expect(screen.getByLabelText(/requesting user id/i)).toBeTruthy();
    expect(screen.getByLabelText(/target patient id/i)).toBeTruthy();
    expect(screen.getByLabelText(/clinical justification/i)).toBeTruthy();
  });

  it('POSTs to /api/v1/identity/break-glass on submit', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'bg-new', requestedByUserId: 'u1', targetPatientId: 'p1', clinicalJustification: 'emergency cardiac access for patient', grantedAt: new Date().toISOString(), expiresAt: futureExpiry }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const user = userEvent.setup();
    render(<BreakGlassAccessPanel />);
    await user.click(screen.getByText('Request Access'));
    await user.type(screen.getByLabelText(/requesting user id/i), 'user-aaa');
    await user.type(screen.getByLabelText(/target patient id/i), 'patient-bbb');
    await user.type(screen.getByLabelText(/clinical justification/i), 'Patient unconscious, need emergency medical history access');
    await user.click(screen.getByText('Request Access', { selector: 'button' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/break-glass'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('calls DELETE /identity/break-glass/{id} on revoke', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockAccesses) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const user = userEvent.setup();
    render(<BreakGlassAccessPanel />);
    await waitFor(() => screen.getByText('user-111'));

    const revokeBtn = screen.getByRole('button', { name: /revoke access bg-001/i });
    await user.click(revokeBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/break-glass/bg-001'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
