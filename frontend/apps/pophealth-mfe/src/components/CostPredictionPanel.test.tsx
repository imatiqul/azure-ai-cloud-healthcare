import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostPredictionPanel } from './CostPredictionPanel';

const mockPrediction = {
  id: 'cp-1',
  patientId: 'P-002',
  predicted12mCostUsd: 52000,
  lowerBound95Usd: 36400,
  upperBound95Usd: 67600,
  costTier: 'High',
  costDrivers: ['CKD Stage 3', 'Hypertension', 'Type 2 Diabetes'],
  modelVersion: 'MEPS-2022',
  predictedAt: '2026-04-21T11:00:00Z',
};

describe('CostPredictionPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the Healthcare Cost Prediction header', () => {
    render(<CostPredictionPanel />);
    expect(screen.getByText('Healthcare Cost Prediction')).toBeDefined();
  });

  it('disables Predict Cost when Patient ID is empty', () => {
    render(<CostPredictionPanel />);
    expect(screen.getByRole('button', { name: /predict cost/i })).toBeDisabled();
  });

  it('can add and remove conditions', async () => {
    const user = userEvent.setup();
    render(<CostPredictionPanel />);

    await user.type(screen.getByPlaceholderText(/hypertension/i), 'CKD Stage 3');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('CKD Stage 3')).toBeDefined();

    // remove chip
    const deleteBtn = screen.getByRole('button', { name: /ckd stage 3/i });
    await user.click(deleteBtn);
    expect(screen.queryByText('CKD Stage 3')).toBeNull();
  });

  it('POSTs correct payload on form submit', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPrediction),
    });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/population-health/cost-prediction');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.patientId).toBe('P-002');
    expect(body.riskLevel).toBe('Medium');
  });

  it('displays predicted cost, bounds, and cost tier', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPrediction),
    });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText(/predicted:/i)).toBeDefined());
    expect(screen.getByText(/tier: high/i)).toBeDefined();
    expect(screen.getByText(/36,400/)).toBeDefined();
    expect(screen.getByText(/67,600/)).toBeDefined();
  });

  it('displays cost drivers', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPrediction),
    });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText('CKD Stage 3')).toBeDefined());
    expect(screen.getByText('Hypertension')).toBeDefined();
    expect(screen.getByText('Type 2 Diabetes')).toBeDefined();
  });

  it('shows error alert on HTTP failure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText(/http 503/i)).toBeDefined());
  });

  it('calls GET cost-prediction/{patientId} when Load Latest is clicked', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPrediction),
    });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /load latest/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/population-health/cost-prediction/P-002');
  });
});
