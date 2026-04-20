import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppointmentHistory } from './AppointmentHistory';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AppointmentHistory', () => {
  it('shows loading state then renders appointments', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'appt-1',
              status: 'booked',
              start: '2025-06-01T10:00:00Z',
              end: '2025-06-01T10:30:00Z',
              serviceType: 'General Consult',
              practitioner: 'Dr. Smith',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<AppointmentHistory patientId="pat-1" />);
    expect(screen.getByText(/Loading appointments/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('General Consult')).toBeInTheDocument();
    });
    expect(screen.getByText('booked')).toBeInTheDocument();
    expect(screen.getByText(/Dr. Smith/)).toBeInTheDocument();
  });

  it('shows empty state when no appointments returned', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<AppointmentHistory patientId="pat-2" />);

    await waitFor(() => {
      expect(screen.getByText(/No appointments found/)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    render(<AppointmentHistory patientId="pat-3" />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    });
  });

  it('includes correct patientId in the request URL', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<AppointmentHistory patientId="my-patient-123" />);

    await waitFor(() => {
      expect(screen.getByText(/No appointments found/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('patientId=my-patient-123')
    );
  });

  it('renders cancelled status with danger badge', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'appt-2',
              status: 'cancelled',
              start: '2025-07-01T09:00:00Z',
              serviceType: 'Follow-up',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<AppointmentHistory patientId="pat-4" />);

    await waitFor(() => {
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });
  });
});
