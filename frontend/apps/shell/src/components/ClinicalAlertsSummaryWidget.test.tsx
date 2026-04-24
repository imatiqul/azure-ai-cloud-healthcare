import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ClinicalAlertsSummaryWidget } from './ClinicalAlertsSummaryWidget';
import { useGlobalStore } from '../store';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeOkResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  mockFetch.mockReset();
  useGlobalStore.setState({ backendOnline: true });
  // 4 API calls: risks, break-glass, waitlist, denials
  mockFetch
    .mockResolvedValueOnce(makeOkResponse([{ patientId: 'PAT-001' }, { patientId: 'PAT-002' }]))
    .mockResolvedValueOnce(makeOkResponse([{ id: 'bg-001' }]))
    .mockResolvedValueOnce(makeOkResponse([{ id: 'wl-001' }, { id: 'wl-002' }]))
    .mockResolvedValueOnce(makeOkResponse([{ id: 'den-001' }]));
});

describe('ClinicalAlertsSummaryWidget', () => {
  it('renders the widget heading', async () => {
    render(<MemoryRouter><ClinicalAlertsSummaryWidget /></MemoryRouter>);
    expect(screen.getByText('Clinical Alerts')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
  });

  it('renders alert category labels', async () => {
    render(<MemoryRouter><ClinicalAlertsSummaryWidget /></MemoryRouter>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
    expect(screen.getByText('High-Risk Patients')).toBeInTheDocument();
    expect(screen.getByText('Break-Glass Active')).toBeInTheDocument();
    expect(screen.getByText('Urgent Waitlist')).toBeInTheDocument();
    expect(screen.getByText('Denial Deadlines')).toBeInTheDocument();
  });

  it('shows View All Alerts link when total > 0', async () => {
    render(<MemoryRouter><ClinicalAlertsSummaryWidget /></MemoryRouter>);
    await waitFor(() => screen.getByText('View All Alerts'));
    const link = screen.getByText('View All Alerts').closest('a');
    expect(link).toHaveAttribute('href', '/alerts');
  });

  it('does not show View All link when counts are all zero', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValue(makeOkResponse([]));
    render(<MemoryRouter><ClinicalAlertsSummaryWidget /></MemoryRouter>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
    expect(screen.queryByText('View All Alerts')).not.toBeInTheDocument();
  });

  it('shows total count chip', async () => {
    render(<MemoryRouter><ClinicalAlertsSummaryWidget /></MemoryRouter>);
    // 2 risks + 1 bg + 2 waitlist + 1 denial = 6
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
