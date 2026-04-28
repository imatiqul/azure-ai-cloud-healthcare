import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostPredictionPanel } from './CostPredictionPanel';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

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
    vi.mocked(gqlFetch).mockReset();
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
    const user = userEvent.setup({ delay: null });
    render(<CostPredictionPanel />);

    await user.type(screen.getByPlaceholderText(/hypertension/i), 'CKD Stage 3');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('CKD Stage 3')).toBeDefined();

    const deleteBtn = screen.getByRole('button', { name: /remove ckd stage 3/i });
    await user.click(deleteBtn);
    expect(screen.queryByText('CKD Stage 3')).toBeNull();
  });

  it('submits correct payload via gqlFetch', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ predictCost: mockPrediction });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(1));
    expect(gqlFetch).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({
          patientId: 'P-002',
          riskLevel: 'Medium',
        }),
      }),
    }));
  });

  it('displays predicted cost, bounds, and cost tier', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ predictCost: mockPrediction });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText(/predicted:/i)).toBeDefined());
    expect(screen.getByText(/tier: high/i)).toBeDefined();
    expect(screen.getByText(/36,400/)).toBeDefined();
    expect(screen.getByText(/67,600/)).toBeDefined();
  });

  it('displays cost drivers', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ predictCost: mockPrediction });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText('CKD Stage 3')).toBeDefined());
    expect(screen.getByText('Hypertension')).toBeDefined();
    expect(screen.getByText('Type 2 Diabetes')).toBeDefined();
  });

  it('shows demo result on submit failure', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockRejectedValueOnce(new Error('Server error'));

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /predict cost/i }));

    await waitFor(() => expect(screen.getByText(/predicted:/i)).toBeDefined());
  });

  it('calls gqlFetch when Load Latest is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ costPrediction: mockPrediction });

    render(<CostPredictionPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-002');
    await user.click(screen.getByRole('button', { name: /load latest/i }));

    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(1));
    expect(gqlFetch).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ patientId: 'P-002' }),
    }));
  });
});
