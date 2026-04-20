import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TenantAdminPanel from './TenantAdminPanel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TENANTS_RESPONSE = {
  total: 2,
  page: 1,
  pageSize: 50,
  items: [
    {
      tenantId: 'ten-uuid-001',
      organisationName: 'Acme Health',
      slug: 'acme-health',
      locale: 'en-US',
      appConfigLabel: 'acme-health',
      dataRegion: 'eastus',
      adminUserId: null,
    },
    {
      tenantId: 'ten-uuid-002',
      organisationName: 'Beta Clinic',
      slug: 'beta-clinic',
      locale: 'es-ES',
      appConfigLabel: 'beta-clinic',
      dataRegion: 'westeurope',
      adminUserId: null,
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(TENANTS_RESPONSE),
  });
});

describe('TenantAdminPanel', () => {
  it('renders heading', async () => {
    render(<TenantAdminPanel />);
    expect(screen.getByText('Tenant Administration')).toBeInTheDocument();
    await waitFor(() => screen.getByText('Acme Health'));
  });

  it('fetches tenants on mount', async () => {
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/tenants'),
      );
    });
  });

  it('displays tenant names and slugs', async () => {
    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText('Acme Health'));
    expect(screen.getByText('Beta Clinic')).toBeInTheDocument();
    expect(screen.getByText('slug: acme-health')).toBeInTheDocument();
    expect(screen.getByText('slug: beta-clinic')).toBeInTheDocument();
  });

  it('shows total count chip', async () => {
    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText('2 total'));
  });

  it('shows empty state when no tenants', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 0, page: 1, pageSize: 50, items: [] }),
    });
    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText(/no tenants provisioned yet/i));
  });

  it('opens provision dialog and validates required fields', async () => {
    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText('Acme Health'));
    fireEvent.click(screen.getByRole('button', { name: /provision tenant/i }));
    expect(screen.getByText('Provision New Tenant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^provision$/i })).toBeDisabled();
  });

  it('POSTs to /api/v1/tenants on provision submit', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(TENANTS_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tenantId: 'new-id', organisationName: 'New Org', slug: 'new-org' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(TENANTS_RESPONSE),
      });

    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText('Acme Health'));
    fireEvent.click(screen.getByRole('button', { name: /provision tenant/i }));

    await userEvent.type(screen.getByLabelText(/organisation name/i), 'New Org');
    await userEvent.type(screen.getByLabelText(/slug/i), 'new-org');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'admin@neworg.com');
    await userEvent.type(screen.getByLabelText(/admin display name/i), 'Admin User');

    fireEvent.click(screen.getByRole('button', { name: /^provision$/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/tenants'),
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('New Org') }),
      );
    });
  });

  it('DELETEs tenant on delete button click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(TENANTS_RESPONSE),
      })
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...TENANTS_RESPONSE, total: 1, items: [TENANTS_RESPONSE.items[0]] }),
      });

    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText('Acme Health'));
    fireEvent.click(screen.getByLabelText(/delete tenant beta-clinic/i));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/tenants/ten-uuid-002'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('shows error alert on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({}) });
    render(<TenantAdminPanel />);
    await waitFor(() => screen.getByText(/failed to load tenants/i));
  });
});
