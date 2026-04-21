import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlatformHealthPanel from './PlatformHealthPanel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  // By default, all services respond with 200
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
  vi.spyOn(performance, 'now').mockReturnValue(100);
});

describe('PlatformHealthPanel', () => {
  it('renders Platform Health heading', async () => {
    render(<PlatformHealthPanel />);
    expect(screen.getByText('Platform Health')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('shows 10 services count chip', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => screen.getByText('10 services'));
    expect(screen.getByText('10 services')).toBeInTheDocument();
  });

  it('shows AI Agents service card', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => screen.getByText('AI Agents'));
    expect(screen.getByText('AI Agents')).toBeInTheDocument();
  });

  it('shows all 10 service labels', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => screen.getByText('AI Agents'));
    const labels = [
      'AI Agents', 'Voice Transcription', 'AI Triage', 'Scheduling',
      'Population Health', 'Revenue Cycle', 'FHIR Interop',
      'Identity & Auth', 'Notifications', 'Document OCR',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows Operational status when services respond 200', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => {
      const chips = screen.queryAllByText('Operational');
      return chips.length > 0;
    });
    expect(screen.getAllByText('Operational').length).toBeGreaterThan(0);
  });

  it('renders refresh button', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /refresh health/i })).toBeInTheDocument();
  });

  it('renders the APIM note', async () => {
    render(<PlatformHealthPanel />);
    await waitFor(() => screen.getByText(/probed via APIM gateway/i));
    expect(screen.getByText(/probed via APIM gateway/i)).toBeInTheDocument();
  });

  it('clicking refresh triggers re-probe', async () => {
    const user = userEvent.setup();
    render(<PlatformHealthPanel />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const callsBefore = mockFetch.mock.calls.length;
    const refreshBtn = screen.getByRole('button', { name: /refresh health/i });
    await user.click(refreshBtn);
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
