import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdentityUserAdminPanel from './IdentityUserAdminPanel';

const mockUsers = [
  {
    id: 'user-001',
    externalId: 'ext-001',
    email: 'alice@example.com',
    displayName: 'Alice Chen',
    role: 'Clinician',
    isActive: true,
    lastLoginAt: '2026-04-19T10:00:00Z',
  },
  {
    id: 'user-002',
    externalId: 'ext-002',
    email: 'bob@example.com',
    displayName: 'Bob Smith',
    role: 'PlatformAdmin',
    isActive: false,
    lastLoginAt: null,
  },
];

const mockResponse = { total: 2, page: 1, pageSize: 50, users: mockUsers };

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('IdentityUserAdminPanel', () => {
  it('renders heading', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    render(<IdentityUserAdminPanel />);
    expect(screen.getByText('Identity User Administration')).toBeTruthy();
  });

  it('fetches users on mount', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    render(<IdentityUserAdminPanel />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/users?page=1&pageSize=50')
      );
    });
  });

  it('shows user display names and emails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    render(<IdentityUserAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Alice Chen')).toBeTruthy();
      expect(screen.getByText('alice@example.com')).toBeTruthy();
      expect(screen.getByText('Bob Smith')).toBeTruthy();
    });
  });

  it('shows total user count chip', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    render(<IdentityUserAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('2 users')).toBeTruthy();
    });
  });

  it('shows empty state alert when no users', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 0, page: 1, pageSize: 50, users: [] }),
    });
    render(<IdentityUserAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no user accounts found/i)).toBeTruthy();
    });
  });

  it('Add User button opens dialog', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    const user = userEvent.setup();
    render(<IdentityUserAdminPanel />);
    await waitFor(() => screen.getByText('Alice Chen'));
    await user.click(screen.getByText('Add User'));
    expect(screen.getByText('Add User Account')).toBeTruthy();
    expect(screen.getByLabelText(/external id/i)).toBeTruthy();
    expect(screen.getByLabelText(/full name/i)).toBeTruthy();
  });

  it('POSTs to /api/v1/identity/users on create submit', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'new-id', email: 'c@x.com', role: 'Clinician' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResponse) });

    const user = userEvent.setup();
    render(<IdentityUserAdminPanel />);
    await waitFor(() => screen.getByText('Alice Chen'));

    await user.click(screen.getByText('Add User'));
    await user.type(screen.getByLabelText(/external id/i), 'ext-003');
    await user.type(screen.getByLabelText(/email/i), 'carol@example.com');
    await user.type(screen.getByLabelText(/full name/i), 'Carol White');
    await user.click(screen.getByText('Create User'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/users'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('calls POST /users/{id}/deactivate on deactivate button', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'user-001', isActive: false }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResponse) });

    const user = userEvent.setup();
    render(<IdentityUserAdminPanel />);
    await waitFor(() => screen.getByText('Alice Chen'));

    const deactivateBtn = screen.getByRole('button', { name: /deactivate alice@example.com/i });
    await user.click(deactivateBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/users/user-001/deactivate'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows error alert on HTTP 403', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    });
    render(<IdentityUserAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText(/http 403/i)).toBeTruthy();
    });
  });
});
