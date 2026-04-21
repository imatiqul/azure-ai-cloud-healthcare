import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ExperimentSummaryPanel from './ExperimentSummaryPanel';

const mockSummary = {
  experimentId: 'triage-prompt-v2',
  controlSampleSize: 120,
  challengerSampleSize: 118,
  controlGuardPassRate: 0.875,
  challengerGuardPassRate: 0.932,
  controlAvgLatencyMs: 412.5,
  challengerAvgLatencyMs: 389.0,
  recommendation: 'promote-challenger',
  statisticallySignificant: true,
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('ExperimentSummaryPanel', () => {
  it('renders the heading', () => {
    render(<ExperimentSummaryPanel />);
    expect(screen.getByText('A/B Experiment Summary')).toBeInTheDocument();
  });

  it('Fetch Summary button is disabled without experiment ID', () => {
    render(<ExperimentSummaryPanel />);
    expect(screen.getByRole('button', { name: 'Fetch Summary' })).toBeDisabled();
  });

  it('GETs /agents/experiments/{id}/summary on lookup', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });

    render(<ExperimentSummaryPanel />);
    const input = screen.getByLabelText('experiment id');
    await user.type(input, 'triage-prompt-v2');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/experiments/triage-prompt-v2/summary'),
      );
    });
  });

  it('shows control and challenger sample sizes', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });

    render(<ExperimentSummaryPanel />);
    await user.type(screen.getByLabelText('experiment id'), 'triage-prompt-v2');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      // "Sample size:" label and the number are split across text-node + <strong>
      // so query the <strong> values directly
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('118')).toBeInTheDocument();
    });
  });

  it('shows promote-challenger chip when recommendation is promote-challenger', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });

    render(<ExperimentSummaryPanel />);
    await user.type(screen.getByLabelText('experiment id'), 'triage-prompt-v2');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      expect(screen.getByText('Promote Challenger')).toBeInTheDocument();
    });
  });

  it('shows statistically significant badge', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });

    render(<ExperimentSummaryPanel />);
    await user.type(screen.getByLabelText('experiment id'), 'triage-prompt-v2');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      expect(screen.getByText(/Significant/)).toBeInTheDocument();
    });
  });

  it('shows no-data alert when recommendation is no-data', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...mockSummary, recommendation: 'no-data', statisticallySignificant: false }),
    });

    render(<ExperimentSummaryPanel />);
    await user.type(screen.getByLabelText('experiment id'), 'empty-exp');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      expect(screen.getByText(/No experiment outcomes recorded/)).toBeInTheDocument();
    });
  });

  it('shows error alert on failed fetch', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 404 });

    render(<ExperimentSummaryPanel />);
    await user.type(screen.getByLabelText('experiment id'), 'bad-exp');
    await user.click(screen.getByRole('button', { name: 'Fetch Summary' }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    });
  });
});
