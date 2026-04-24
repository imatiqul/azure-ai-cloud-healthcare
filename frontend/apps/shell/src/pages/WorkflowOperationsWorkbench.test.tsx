import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowOperationsWorkbench from './WorkflowOperationsWorkbench';

// ── Mock useWorkflowOpsStream ────────────────────────────────────────────────
let _mockConnectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'connected';

vi.mock('../hooks/useWorkflowOpsStream', () => ({
  useWorkflowOpsStream: () => ({
    lastUpdate: null,
    liveWorkflows: new Map(),
    connectionState: _mockConnectionState,
    clearLiveCache: vi.fn(),
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const SUMMARY_RESPONSE = {
  total: 9,
  awaitingHumanReview: 2,
  attentionRequired: 3,
  bookedToday: 4,
  waitlistFallbacks: 1,
  reviewOverdue: 1,
  averageReviewMinutes: 12.5,
  automationCompletionRate: 0.75,
  autoBooked: 3,
  manualBooked: 1,
};

const WORKFLOW_RESPONSE = [
  {
    id: 'wf-1',
    sessionId: 'sess-1',
    patientId: 'pat-1',
    patientName: 'Jamie Carter',
    status: 'AwaitingHumanReview',
    triageLevel: 'P2_Urgent',
    requiresAttention: true,
    reviewOverdue: true,
    latestExceptionCode: 'REVIEW_SLA',
    latestExceptionMessage: 'Workflow review SLA has expired.',
    encounterStatus: 'Completed',
    revenueStatus: 'Failed',
    schedulingStatus: 'Pending',
    notificationStatus: 'Failed',
    escalationStatus: 'Open',
    lastActivityAt: new Date().toISOString(),
  },
  {
    id: 'wf-2',
    sessionId: 'sess-2',
    patientId: 'pat-2',
    patientName: 'Taylor Brooks',
    status: 'Completed',
    triageLevel: 'P3_Standard',
    schedulingStatus: 'NeedsAttention',
    waitlistQueuedAt: new Date().toISOString(),
    encounterStatus: 'Completed',
    revenueStatus: 'Completed',
    notificationStatus: 'Completed',
    escalationStatus: 'Claimed',
    lastActivityAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/agents/workflows/summary')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SUMMARY_RESPONSE) });
    }

    if (url.includes('/agents/workflows?top=80')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(WORKFLOW_RESPONSE) });
    }

    // Any workflow action POST — return the updated first workflow record
    if (url.includes('/agents/workflows/wf-1/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...WORKFLOW_RESPONSE[0], status: 'Completed', requiresAttention: false }),
      });
    }

    if (url.includes('/agents/workflows/wf-2/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...WORKFLOW_RESPONSE[1], escalationStatus: 'Open' }),
      });
    }

    return Promise.reject(new Error(`Unhandled URL ${url}`));
  });
});

describe('WorkflowOperationsWorkbench', () => {
  it('renders the supervisor workbench heading', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    expect(screen.getByText('Workflow Operations Workbench')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('shows workflow summary cards from the API', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Attention Required'));
    expect(screen.getByText('Awaiting Human Review')).toBeInTheDocument();
    expect(screen.getByText('Automation Health')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('renders attention queue items from the workflow endpoint', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByText('Workflow review SLA has expired.')).toBeInTheDocument();
    expect(screen.getAllByText('Review in Triage').length).toBeGreaterThan(0);
  });

  it('shows Approve button for AwaitingHumanReview workflows', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });

  it('shows Claim button for workflows with Open escalation status', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByRole('button', { name: /claim/i })).toBeInTheDocument();
  });

  it('shows Release Claim button for Claimed escalation workflows when filter is All', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    // Switch to All filter to see the Taylor Brooks (Claimed) record
    await waitFor(() => screen.getByText('Jamie Carter'));
    const allChip = screen.getByText('All');
    fireEvent.click(allChip);
    await waitFor(() => screen.getByText('Taylor Brooks'));
    expect(screen.getByRole('button', { name: /release claim/i })).toBeInTheDocument();
  });

  it('shows Retry Revenue button for Failed revenue status', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByRole('button', { name: /retry revenue/i })).toBeInTheDocument();
  });

  it('shows Retry Notification button for Failed notification status', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByRole('button', { name: /retry notification/i })).toBeInTheDocument();
  });

  it('shows Requeue Scheduling button for NeedsAttention scheduling status when filter is All', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    fireEvent.click(screen.getByText('All'));
    await waitFor(() => screen.getByText('Taylor Brooks'));
    expect(screen.getByRole('button', { name: /requeue scheduling/i })).toBeInTheDocument();
  });

  it('opens approve dialog when Approve button is clicked', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByRole('button', { name: /approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => screen.getByText('Approve Escalation Review'));
    expect(screen.getByText(/Scheduling will be triggered automatically after approval/i)).toBeInTheDocument();
  });

  it('calls the approve endpoint when the dialog is confirmed', async () => {
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => screen.getByText('Approve Escalation Review'));

    const confirmButton = screen.getByRole('button', { name: /^approve$/i });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/workflows/wf-1/approve'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows Live chip when connectionState is connected', async () => {
    _mockConnectionState = 'connected';
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows Offline chip when connectionState is error', async () => {
    _mockConnectionState = 'error';
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows Connecting chip when connectionState is connecting', async () => {
    _mockConnectionState = 'connecting';
    render(
      <MemoryRouter>
        <WorkflowOperationsWorkbench />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText('Jamie Carter'));
    expect(screen.getByText('Connecting')).toBeInTheDocument();
  });
});