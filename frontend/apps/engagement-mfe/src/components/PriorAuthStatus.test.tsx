import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PriorAuthStatus } from './PriorAuthStatus';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PriorAuthStatus', () => {
  it('shows loading then renders prior auth records', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'auth-1',
              patientId: 'pat-1',
              procedure: 'MRI Brain',
              status: 'Approved',
              insurancePayer: 'BlueCross',
              requestedAt: '2025-04-01T10:00:00Z',
              resolvedAt: '2025-04-03T14:00:00Z',
            },
            {
              id: 'auth-2',
              patientId: 'pat-1',
              procedure: 'Physical Therapy',
              status: 'Pending',
              insurancePayer: 'Aetna',
              requestedAt: '2025-05-10T09:00:00Z',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<PriorAuthStatus patientId="pat-1" />);
    expect(screen.getByText(/Loading prior authorizations/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('MRI Brain')).toBeInTheDocument();
    });
    expect(screen.getByText('Physical Therapy')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows empty state when no prior auths', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<PriorAuthStatus patientId="pat-2" />);

    await waitFor(() => {
      expect(screen.getByText(/No prior authorization requests found/)).toBeInTheDocument();
    });
  });

  it('shows error on fetch failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    render(<PriorAuthStatus patientId="pat-3" />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    });
  });

  it('shows denial reason when status is denied', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'auth-3',
              patientId: 'pat-4',
              procedure: 'Knee Surgery',
              status: 'Denied',
              insurancePayer: 'United',
              requestedAt: '2025-03-01T08:00:00Z',
              resolvedAt: '2025-03-05T16:00:00Z',
              denialReason: 'Not medically necessary',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<PriorAuthStatus patientId="pat-4" />);

    await waitFor(() => {
      expect(screen.getByText('Knee Surgery')).toBeInTheDocument();
    });
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText(/Not medically necessary/)).toBeInTheDocument();
  });

  it('passes patientId in query string', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<PriorAuthStatus patientId="auth-patient-99" />);

    await waitFor(() => {
      expect(screen.getByText(/No prior authorization/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('patientId=auth-patient-99')
    );
  });
});
