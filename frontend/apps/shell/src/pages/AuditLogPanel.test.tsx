import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogPanel from './AuditLogPanel';

const mockSummary = {
  period: 'last 30 days',
  since: '2026-03-21T00:00:00Z',
  summary: [
    { userId: 'user-abc', httpMethod: 'GET', count: 142, lastAccessed: '2026-04-20T08:00:00Z' },
    { userId: 'user-def', httpMethod: 'POST', count: 27, lastAccessed: '2026-04-19T16:00:00Z' },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('AuditLogPanel', () => {
  it('renders heading', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });
    render(<AuditLogPanel />);
    expect(screen.getByText('PHI Audit Log')).toBeTruthy();
  });

  it('fetches audit summary on mount with default 30 days', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/audit/summary?days=30')
      );
    });
  });

  it('shows user IDs, methods and counts in table', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(screen.getByText('user-abc')).toBeTruthy();
      expect(screen.getByText('GET')).toBeTruthy();
      expect(screen.getByText('142')).toBeTruthy();
      expect(screen.getByText('user-def')).toBeTruthy();
    });
  });

  it('shows empty state alert when no audit records', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ period: 'last 30 days', since: '2026-03-21', summary: [] }),
    });
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no audit records found/i)).toBeTruthy();
    });
  });

  it('Download CSV button calls export endpoint', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSummary) })
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['csv'], { type: 'text/csv' })) });

    global.URL.createObjectURL = vi.fn(() => 'blob:url');
    global.URL.revokeObjectURL = vi.fn();

    const user = userEvent.setup();
    render(<AuditLogPanel />);
    await waitFor(() => screen.getByText('user-abc'));

    await user.click(screen.getByText('Download CSV'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/audit/export')
      );
    });
  });

  it('shows period chip from API response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(screen.getByText('last 30 days')).toBeTruthy();
    });
  });

  it('shows error alert on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(screen.getByText(/http 500/i)).toBeTruthy();
    });
  });
});
