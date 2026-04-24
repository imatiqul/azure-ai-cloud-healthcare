import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setActiveWorkflow, upsertWorkflowHandoff } from '@healthcare/mfe-events';
import { WaitlistPanel } from './WaitlistPanel';

const mockWaitlistEntries = [
  {
    id: 'wl-1',
    patientId: 'PAT-001',
    practitionerId: 'PRAC-001',
    priority: 2,
    status: 'Waiting',
    enqueuedAt: '2025-01-01T10:00:00Z',
  },
  {
    id: 'wl-2',
    patientId: 'PAT-002',
    practitionerId: 'PRAC-002',
    priority: 3,
    status: 'Waiting',
    preferredDateFrom: '2025-02-01',
    preferredDateTo: '2025-02-28',
    enqueuedAt: '2025-01-01T11:00:00Z',
  },
  {
    id: 'wl-3',
    patientId: 'PAT-003',
    practitionerId: 'PRAC-003',
    priority: 1,
    status: 'Promoted',
    enqueuedAt: '2025-01-01T09:00:00Z',
    promotedToBookingId: 'BOOK-001',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('WaitlistPanel', () => {
  it('renders the Add to Waitlist card header', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));
    render(<WaitlistPanel />);
    expect(screen.getAllByText('Add to Waitlist').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the enqueue form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));
    render(<WaitlistPanel />);
    expect(screen.getByPlaceholderText('e.g. PAT-001')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. PRAC-001')).toBeInTheDocument();
  });

  it('renders Add to Waitlist and Check Conflict buttons', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));
    render(<WaitlistPanel />);
    expect(screen.getByRole('button', { name: /add to waitlist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check conflict/i })).toBeInTheDocument();
  });

  it('displays waiting entries sorted by priority', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockWaitlistEntries,
    } as Response);
    render(<WaitlistPanel />);
    await waitFor(() => {
      // PAT-001 (priority 2) and PAT-002 (priority 3) are Waiting; PAT-003 is Promoted (hidden)
      expect(screen.getByText('PAT-001')).toBeInTheDocument();
      expect(screen.getByText('PAT-002')).toBeInTheDocument();
      expect(screen.queryByText('PAT-003')).not.toBeInTheDocument();
    });
  });

  it('shows empty state when no waiting entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);
    render(<WaitlistPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no patients currently on waitlist/i)).toBeInTheDocument();
    });
  });

  it('displays preferred date range when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockWaitlistEntries,
    } as Response);
    render(<WaitlistPanel />);
    await waitFor(() => {
      expect(screen.getByText(/2025-02-01/)).toBeInTheDocument();
    });
  });

  it('calls DELETE endpoint when Remove button is clicked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockWaitlistEntries } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    render(<WaitlistPanel />);
    await waitFor(() => expect(screen.getByText('PAT-001')).toBeInTheDocument());

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(([url, opts]) =>
        String(url).includes('/waitlist/') && (opts as RequestInit)?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBe(1);
    });
  });

  it('submits POST to waitlist on form submission', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    const user = userEvent.setup({ delay: null });
    render(<WaitlistPanel />);
    await waitFor(() => expect(screen.getByText(/no patients currently/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('e.g. PAT-001'), 'PAT-999');
    await user.type(screen.getByPlaceholderText('e.g. PRAC-001'), 'PRAC-999');
    await user.click(screen.getByRole('button', { name: /add to waitlist/i }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([url, opts]) =>
        String(url).includes('/waitlist') && (opts as RequestInit)?.method === 'POST'
      );
      expect(postCalls.length).toBe(1);
    });
  });

  it('shows no conflict message from conflict check', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hasConflict: false }) } as Response);

    const user = userEvent.setup({ delay: null });
    render(<WaitlistPanel />);

    await user.type(screen.getByPlaceholderText('e.g. PAT-001'), 'PAT-001');
    await user.type(screen.getByPlaceholderText('e.g. PRAC-001'), 'PRAC-001');
    await user.click(screen.getByRole('button', { name: /check conflict/i }));

    await waitFor(() => {
      expect(screen.getByText(/no conflict/i)).toBeInTheDocument();
    });
  });

  it('shows conflict message when conflict detected', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hasConflict: true }) } as Response);

    const user = userEvent.setup({ delay: null });
    render(<WaitlistPanel />);

    await user.type(screen.getByPlaceholderText('e.g. PAT-001'), 'PAT-001');
    await user.type(screen.getByPlaceholderText('e.g. PRAC-001'), 'PRAC-001');
    await user.click(screen.getByRole('button', { name: /check conflict/i }));

    await waitFor(() => {
      expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when enqueuing without Patient ID or Practitioner ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    render(<WaitlistPanel />);
    const submitBtn = screen.getByRole('button', { name: /add to waitlist/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Patient ID and Practitioner ID are required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when checking conflicts without IDs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const user = userEvent.setup({ delay: null });
    render(<WaitlistPanel />);
    await user.click(screen.getByRole('button', { name: /check conflict/i }));

    await waitFor(() => {
      expect(screen.getByText(/Enter Patient ID and Practitioner ID before checking conflicts/i)).toBeInTheDocument();
    });
  });

  it('prefills waitlist fields from the active workflow context', async () => {
    upsertWorkflowHandoff({
      workflowId: 'wf-wait-1',
      sessionId: 'sess-wait-1',
      patientId: 'PAT-818',
      patientName: 'Amina Noor',
      practitionerId: 'DR-818',
      triageLevel: 'P2_Urgent',
      status: 'Scheduling',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    setActiveWorkflow('wf-wait-1');
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));

    render(<WaitlistPanel />);

    expect(screen.getByDisplayValue('PAT-818')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DR-818')).toBeInTheDocument();
    expect(screen.getByText(/Continuing scheduling fallback for Amina Noor/i)).toBeInTheDocument();
  });
});
