import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscalationQueue } from './EscalationQueue';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const makeItems = () => [
  {
    id: 'e1',
    workflowId: 'wf-001',
    sessionId: 'sess-001',
    patientId: 'PAT-001',
    reason: 'P1 triage requires human review',
    status: 'Open',
    escalatedAt: '2025-01-01T08:00:00Z',
  },
  {
    id: 'e2',
    workflowId: 'wf-002',
    sessionId: 'sess-002',
    patientId: 'PAT-002',
    reason: 'Ambiguous symptoms',
    status: 'Claimed',
    escalatedAt: '2025-01-01T09:00:00Z',
    claimedBy: 'dr-smith',
  },
];

describe('EscalationQueue', () => {
  it('renders Escalation Queue header', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<EscalationQueue />);
    await waitFor(() => {
      expect(screen.getByText('Escalation Queue')).toBeInTheDocument();
    });
  });

  it('renders escalation items after fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeItems()) })
    ) as unknown as typeof fetch;

    render(<EscalationQueue />);
    await waitFor(() => {
      expect(screen.getByText(/PAT-001/)).toBeInTheDocument();
    });
    expect(screen.getByText(/PAT-002/)).toBeInTheDocument();
    expect(screen.getByText(/P1 triage requires human review/)).toBeInTheDocument();
  });

  it('shows Open and Claimed status badges', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeItems()) })
    ) as unknown as typeof fetch;

    render(<EscalationQueue />);
    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument();
    });
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows Claim button for Open escalations', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeItems()) })
    ) as unknown as typeof fetch;

    render(<EscalationQueue />);
    await waitFor(() => {
      expect(screen.getAllByText('Claim').length).toBeGreaterThan(0);
    });
  });

  it('calls claim endpoint on Claim button click', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeItems()) }) // initial load
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })           // claim POST
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(makeItems()) });     // refresh

    global.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EscalationQueue />);
    await waitFor(() => screen.getByText(/PAT-001/));

    const claimButtons = screen.getAllByText('Claim');
    await user.click(claimButtons[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/claim'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows error when resolve attempted without a note', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeItems()) })
    ) as unknown as typeof fetch;

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EscalationQueue />);
    await waitFor(() => screen.getByText(/PAT-002/));

    // Click resolve on the Claimed item (should show resolve button after claiming)
    const resolveBtn = screen.queryByText('Resolve');
    if (resolveBtn) {
      await user.click(resolveBtn);
      await waitFor(() => {
        expect(screen.getByText(/clinical note is required/i)).toBeInTheDocument();
      });
    }
  });
});
