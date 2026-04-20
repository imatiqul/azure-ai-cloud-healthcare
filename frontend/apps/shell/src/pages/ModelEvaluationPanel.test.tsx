import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelEvaluationPanel from './ModelEvaluationPanel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const HISTORY_RUNS = [
  {
    id: 'eval-uuid-001',
    modelRegistryEntryId: 'model-uuid-001',
    score: 0.875,
    totalCases: 8,
    passedCases: 7,
    passedThreshold: true,
    evaluatedAt: '2026-04-20T10:00:00Z',
  },
  {
    id: 'eval-uuid-002',
    modelRegistryEntryId: 'model-uuid-001',
    score: 0.625,
    totalCases: 8,
    passedCases: 5,
    passedThreshold: false,
    evaluatedAt: '2026-04-19T10:00:00Z',
  },
];

const EVAL_RESULT = {
  id: 'eval-uuid-003',
  modelRegistryEntryId: 'model-uuid-001',
  score: 0.875,
  totalCases: 8,
  passedCases: 7,
  passedThreshold: true,
  evaluatedAt: '2026-04-20T11:00:00Z',
  status: 'PASS',
};

beforeEach(() => {
  mockFetch.mockReset();
  // Default: history load on mount
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(HISTORY_RUNS),
  });
});

describe('ModelEvaluationPanel', () => {
  it('renders headings', async () => {
    render(<ModelEvaluationPanel />);
    expect(screen.getByText('Model Prompt Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Run Regression Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Evaluation History')).toBeInTheDocument();
    await waitFor(() => screen.getByText(/87%/));
  });

  it('fetches evaluation history on mount', async () => {
    render(<ModelEvaluationPanel />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/governance/evaluate/history'),
      );
    });
  });

  it('displays history run scores and pass/fail badges', async () => {
    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getByText('87%'));
    expect(screen.getByText('63%')).toBeInTheDocument();
  });

  it('shows PASS and FAIL badges in history', async () => {
    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getAllByText('PASS'));
    expect(screen.getByText('FAIL')).toBeInTheDocument();
  });

  it('run button is disabled without user ID', async () => {
    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getByText('87%'));
    expect(screen.getByRole('button', { name: /run evaluation/i })).toBeDisabled();
  });

  it('POSTs to /governance/evaluate with user ID', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HISTORY_RUNS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(EVAL_RESULT) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HISTORY_RUNS) });

    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getByText('87%'));

    await userEvent.type(screen.getByLabelText(/evaluated by user id/i), 'user-123');
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/governance/evaluate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('user-123'),
        }),
      );
    });
  });

  it('shows PASS badge and score chip after successful evaluation', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(EVAL_RESULT) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HISTORY_RUNS) });

    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getByText(/no evaluation runs yet/i));

    await userEvent.type(screen.getByLabelText(/evaluated by user id/i), 'user-abc');
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));

    await waitFor(() => screen.getAllByText('PASS'));
    expect(screen.getByText(/Score: 88%|Score: 87%/)).toBeInTheDocument();
  });

  it('shows error alert on network failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });

    render(<ModelEvaluationPanel />);
    await waitFor(() => screen.getByText(/failed to load evaluation history/i));
  });
});
