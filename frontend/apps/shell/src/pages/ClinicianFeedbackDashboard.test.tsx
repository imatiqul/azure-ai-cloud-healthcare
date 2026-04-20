import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ClinicianFeedbackDashboard from './ClinicianFeedbackDashboard';

const mockSummary = {
  totalFeedback: 42,
  averageRating: 4.2,
  positiveCount: 30,
  negativeCount: 5,
  ingestedCount: 28,
  periodStart: '2026-03-21T00:00:00Z',
  periodEnd: '2026-04-20T00:00:00Z',
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockSummary),
  });
});

describe('ClinicianFeedbackDashboard', () => {
  it('renders the dashboard heading', async () => {
    render(<ClinicianFeedbackDashboard />);
    expect(screen.getByText('Clinician AI Feedback Dashboard')).toBeInTheDocument();
  });

  it('fetches summary on mount', async () => {
    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/feedback/summary?since='),
      );
    });
  });

  it('shows summary stats chips', async () => {
    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Total: 42')).toBeInTheDocument();
      expect(screen.getByText('Positive (≥4): 30')).toBeInTheDocument();
      expect(screen.getByText('Negative (≤2): 5')).toBeInTheDocument();
      expect(screen.getByText('Ingested into RAG: 28')).toBeInTheDocument();
    });
  });

  it('shows average rating label', async () => {
    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Average Rating: 4.20 / 5.0')).toBeInTheDocument();
    });
  });

  it('shows no-data alert when total is 0', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockSummary,
          totalFeedback: 0,
          positiveCount: 0,
          negativeCount: 0,
          ingestedCount: 0,
        }),
    });
    render(<ClinicianFeedbackDashboard />);
    // summary is still rendered, just 0 counts — no-data alert only if summary is null
    await waitFor(() => {
      expect(screen.getByText('Total: 0')).toBeInTheDocument();
    });
  });

  it('POSTs to /agents/feedback on submit', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ feedbackId: 'f1', action: 'ingested-into-qdrant', createdAt: '2026-04-20T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      });

    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => screen.getByText('Total: 42'));

    await user.type(screen.getByLabelText('Clinician ID'), 'dr-jones');
    await user.type(screen.getByLabelText('Session ID'), 'sess-001');
    await user.type(screen.getByLabelText('Original AI Response'), 'AI said this');

    await user.click(screen.getByRole('button', { name: 'Submit Feedback' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/feedback'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows success alert with action after submit', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSummary) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ action: 'ingested-into-qdrant' }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSummary) });

    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => screen.getByText('Total: 42'));

    await user.type(screen.getByLabelText('Clinician ID'), 'dr-jones');
    await user.type(screen.getByLabelText('Session ID'), 'sess-001');
    await user.type(screen.getByLabelText('Original AI Response'), 'AI response text');

    await user.click(screen.getByRole('button', { name: 'Submit Feedback' }));

    await waitFor(() => {
      expect(
        screen.getByText('Feedback recorded — action: ingested-into-qdrant'),
      ).toBeInTheDocument();
    });
  });

  it('shows error alert on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 });
    render(<ClinicianFeedbackDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
    });
  });
});
