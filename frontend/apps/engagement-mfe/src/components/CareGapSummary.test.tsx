import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CareGapSummary } from './CareGapSummary';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('CareGapSummary', () => {
  it('shows loading then renders open care gaps', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'gap-1',
              patientId: 'pat-1',
              gapType: 'HbA1c Screening',
              description: 'Annual HbA1c overdue',
              status: 'Open',
              identifiedAt: '2025-01-15T00:00:00Z',
            },
            {
              id: 'gap-2',
              patientId: 'pat-1',
              gapType: 'Colonoscopy',
              description: 'Colorectal screening overdue',
              status: 'Open',
              identifiedAt: '2025-02-01T00:00:00Z',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<CareGapSummary patientId="pat-1" />);
    expect(screen.getByText(/Loading care gaps/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('HbA1c Screening')).toBeInTheDocument();
    });
    expect(screen.getByText(/Open Care Gaps \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Colonoscopy')).toBeInTheDocument();
  });

  it('shows empty state when no gaps', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<CareGapSummary patientId="pat-2" />);

    await waitFor(() => {
      expect(screen.getByText(/No care gaps identified/)).toBeInTheDocument();
    });
  });

  it('separates open and closed gaps', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'gap-3',
              patientId: 'pat-3',
              gapType: 'Flu Vaccine',
              description: 'Flu shot recommended',
              status: 'Open',
              identifiedAt: '2025-03-01T00:00:00Z',
            },
            {
              id: 'gap-4',
              patientId: 'pat-3',
              gapType: 'Blood Pressure Check',
              description: 'BP monitoring resolved',
              status: 'Resolved',
              identifiedAt: '2024-12-01T00:00:00Z',
              resolvedAt: '2025-01-10T00:00:00Z',
            },
          ]),
      })
    ) as unknown as typeof fetch;

    render(<CareGapSummary patientId="pat-3" />);

    await waitFor(() => {
      expect(screen.getByText('Flu Vaccine')).toBeInTheDocument();
    });
    expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
    expect(screen.getByText(/Open Care Gaps \(1\)/)).toBeInTheDocument();
  });

  it('shows demo care gaps on fetch failure instead of error banner', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    render(<CareGapSummary patientId="pat-4" />);

    await waitFor(() => {
      // Demo data contains 'HbA1c' gap — confirms fallback renders
      expect(screen.getByText('HbA1c')).toBeInTheDocument();
    });
    expect(screen.queryByText(/HTTP 500/)).toBeNull();
  });

  it('passes patientId in query string', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<CareGapSummary patientId="gap-patient-xyz" />);

    await waitFor(() => {
      expect(screen.getByText(/No care gaps/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('patientId=gap-patient-xyz'),
      expect.any(Object),
    );
  });
});
