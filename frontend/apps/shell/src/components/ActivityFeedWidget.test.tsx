import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ActivityFeedWidget } from './ActivityFeedWidget';
import { useGlobalStore } from '../store';

const RISKS = [
  { patientId: 'aaaaaaaa-0000-0000-0000-000000000001', riskLevel: 'Critical', assessedAt: new Date(Date.now() - 60_000).toISOString() },
  { patientId: 'bbbbbbbb-0000-0000-0000-000000000002', riskLevel: 'High',     assessedAt: new Date(Date.now() - 300_000).toISOString() },
];

const TRIAGE = { pendingTriage: 3, awaitingReview: 1, completed: 12 };

const APPOINTMENTS = [
  { id: 'a1', patientId: 'cccccccc-0000-0000-0000-000000000003', bookedAt: new Date(Date.now() - 1_800_000).toISOString() },
];

const DENIALS = [
  { id: 'd1', claimNumber: 'CLM-001', payerName: 'BlueCross', denialStatus: 'Open', appealDeadline: new Date(Date.now() - 3_600_000).toISOString() },
];

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if ((url as string).includes('population-health/risks'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RISKS) });
    if ((url as string).includes('agents/stats'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(TRIAGE) });
    if ((url as string).includes('scheduling/appointments'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(APPOINTMENTS) });
    if ((url as string).includes('revenue/denials'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(DENIALS) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }));
}

beforeEach(() => { mockFetch(); useGlobalStore.setState({ backendOnline: true }); });
afterEach(() => vi.restoreAllMocks());

function renderWidget() {
  return render(<MemoryRouter><ActivityFeedWidget /></MemoryRouter>);
}

describe('ActivityFeedWidget', () => {
  it('renders the Activity Feed heading', () => {
    renderWidget();
    expect(screen.getByText('Activity Feed')).toBeInTheDocument();
  });

  it('shows a loading spinner on initial render', () => {
    renderWidget();
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('renders a risk assessment event after load', async () => {
    renderWidget();
    await waitFor(() => {
      const items = screen.getAllByText('Patient risk assessed');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  it('renders the triage pending count event', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText(/3 triage cases? pending/i)).toBeInTheDocument());
  });

  it('renders a denial event with claim number', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText(/CLM-001/)).toBeInTheDocument());
  });

  it('renders Risk and Triage type chips', async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getAllByText('Risk').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Triage').length).toBeGreaterThan(0);
    });
  });

  it('renders the refresh button', () => {
    renderWidget();
    expect(screen.getByRole('button', { name: /refresh activity feed/i })).toBeInTheDocument();
  });

  it('shows empty state when all APIs return empty arrays', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ));
    renderWidget();
    await waitFor(() => expect(screen.getByText('No recent activity')).toBeInTheDocument());
  });

  it('re-fetches when the refresh button is clicked', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getAllByText('Patient risk assessed').length).toBeGreaterThan(0));
    const fetchMock = vi.mocked(fetch);
    const countBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /refresh activity feed/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(countBefore));
  });
});
