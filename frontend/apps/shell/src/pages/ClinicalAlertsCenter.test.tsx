import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClinicalAlertsCenter from './ClinicalAlertsCenter';
import { useGlobalStore } from '../store';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const RISKS = [
  { patientId: 'PAT-001', riskLevel: 'Critical', riskScore: 0.92 },
  { patientId: 'PAT-002', riskLevel: 'High',     riskScore: 0.75 },
];

const BREAK_GLASS = [
  {
    id: 'bg-001',
    requestedByUserId: 'dr.smith@clinic.org',
    targetPatientId: 'PAT-005',
    clinicalJustification: 'Emergency cardiac procedure',
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    isRevoked: false,
  },
];

const WAITLIST = [
  { id: 'wl-001', patientId: 'PAT-010', practitionerId: 'prac-001', priority: 1, status: 'Waiting' },
  { id: 'wl-002', patientId: 'PAT-011', practitionerId: 'prac-002', priority: 3, status: 'Waiting' },
];

const DENIALS = [
  {
    id: 'den-001',
    claimNumber: 'CLM-2024-001',
    payerName: 'BlueCross',
    deniedAmountUsd: 4500,
    appealDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), // 3 days away
    denialStatus: 'Open',
  },
];

function mockAllApis() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(RISKS) })       // /risks
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(BREAK_GLASS) }) // /break-glass
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(WAITLIST) })    // /waitlist
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(DENIALS) });    // /denials
}

beforeEach(() => {
  mockFetch.mockReset();
  useGlobalStore.setState({ backendOnline: true });
  mockAllApis();
});

describe('ClinicalAlertsCenter', () => {
  it('renders the page heading', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    expect(screen.getByText('Clinical Alerts Center')).toBeInTheDocument();
    await waitFor(() => screen.getByText('PAT-001'));
  });

  it('shows critical and high risk patients', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => screen.getByText('PAT-001'));
    expect(screen.getByText('PAT-002')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows active break-glass session', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => screen.getByText('dr.smith@clinic.org'));
    expect(screen.getByText(/PAT-005/)).toBeInTheDocument();
  });

  it('shows urgent waitlist entries (priority ≤ 2 only)', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => screen.getByText('PAT-010'));
    // PAT-011 has priority 3 — not shown
    expect(screen.queryByText('PAT-011')).not.toBeInTheDocument();
  });

  it('shows near-deadline denials with days remaining', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => screen.getByText('CLM-2024-001'));
    expect(screen.getByText(/BlueCross/)).toBeInTheDocument();
  });

  it('shows summary alert count chips', async () => {
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    // Wait for data to load (counts > 0 in chip labels)
    await waitFor(() => screen.getByText(/1 Critical Risk/));
    expect(screen.getByText(/1 High Risk/)).toBeInTheDocument();
    expect(screen.getByText(/1 Break-Glass Active/)).toBeInTheDocument();
    // "Urgent Waitlist" also appears as card title — use count prefix to be specific
    expect(screen.getByText(/1 Urgent Waitlist/)).toBeInTheDocument();
    expect(screen.getAllByText(/Denial Deadlines/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no high-risk patients', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })           // no risks
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })           // no break-glass
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })           // no waitlist
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });          // no denials

    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => screen.getByText(/No high-risk patients/));
    expect(screen.getByText(/No active break-glass/)).toBeInTheDocument();
  });

  it('shows error alert when fetch fails', async () => {
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><ClinicalAlertsCenter /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Failed to load clinical alerts/)).toBeInTheDocument();
  });
});
