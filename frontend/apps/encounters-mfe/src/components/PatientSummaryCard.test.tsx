import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PatientSummaryCard } from './PatientSummaryCard';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z').getTime() });
});

afterEach(() => {
  vi.useRealTimers();
});

const MOCK_SUMMARY = {
  id: 'PAT-TEST-01',
  fullName: 'Jane Test',
  dateOfBirth: '1980-05-20',
  gender: 'Female',
  conditions: ['Hypertension', 'Type 2 Diabetes'],
  readmissionRisk: 55,
  riskLevel: 'Moderate' as const,
  lastEncounterDate: new Date('2026-01-13T12:00:00Z').toISOString(),
  activeMedCount: 3,
  allergiesCount: 1,
};

describe('PatientSummaryCard', () => {
  it('renders nothing when patientId is empty', () => {
    const { container } = render(<PatientSummaryCard patientId="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a loading skeleton while fetching', async () => {
    // Fetch that never resolves
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    render(<PatientSummaryCard patientId="PAT-TEST-01" />);

    // MUI Skeleton renders with role="progressbar" or as a div with class
    const skeletons = document.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays API data on successful fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_SUMMARY),
      })
    ) as unknown as typeof fetch;

    render(<PatientSummaryCard patientId="PAT-TEST-01" />);

    await waitFor(() => {
      expect(screen.getByText('Jane Test')).toBeInTheDocument();
    });

    expect(screen.getByText(/Hypertension/)).toBeInTheDocument();
    expect(screen.getByText(/Type 2 Diabetes/)).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('falls back to demo data for known demo patient ID on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

    render(<PatientSummaryCard patientId="PAT-00142" />);

    await waitFor(() => {
      expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    });

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText(/Type 2 Diabetes Mellitus/)).toBeInTheDocument();
  });

  it('falls back to demo data when fetch returns non-ok status', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    render(<PatientSummaryCard patientId="PAT-00278" />);

    await waitFor(() => {
      expect(screen.getByText('James Chen')).toBeInTheDocument();
    });

    expect(screen.getByText(/Coronary Artery Disease/)).toBeInTheDocument();
  });

  it('renders nothing for unknown patient when fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Not found'))) as unknown as typeof fetch;

    const { container } = render(<PatientSummaryCard patientId="PAT-UNKNOWN-XYZ" />);

    // After fetch failure with no demo data, component renders null
    await waitFor(() => {
      expect(container.querySelector('.MuiSkeleton-root')).toBeNull();
    });
    expect(container.querySelector('[data-testid]')).toBeNull();
  });

  it('uses absolute age calculation from dateOfBirth', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...MOCK_SUMMARY, dateOfBirth: '1980-05-20' }),
      })
    ) as unknown as typeof fetch;

    render(<PatientSummaryCard patientId="PAT-TEST-01" />);

    await waitFor(() => {
      expect(screen.getByText('Jane Test')).toBeInTheDocument();
    });

    // Age at 2026-01-15 from DOB 1980-05-20 = 45
    expect(screen.getByText(/45\s*y/i)).toBeInTheDocument();
  });
});
