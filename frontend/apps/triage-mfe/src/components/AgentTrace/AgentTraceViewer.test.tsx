import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AgentTraceViewer } from './AgentTraceViewer';
import type { AgentTraceDto } from '../../api/agentTraces';

const trace: AgentTraceDto = {
  sessionId: 'abc',
  status: 'completed',
  startedAt: '2026-04-26T00:00:00Z',
  completedAt: '2026-04-26T00:00:01Z',
  steps: [
    {
      stepId: 's1',
      parentStepId: null,
      kind: 'plan',
      agentName: 'Triage',
      input: 'goal',
      output: 'plan ok',
      confidence: 0.9,
      verdict: 'ok',
      citations: [{ sourceId: 'c1', title: 'Protocol', score: 0.9 }],
      startedAt: '2026-04-26T00:00:00Z',
      completedAt: '2026-04-26T00:00:00Z',
    },
    {
      stepId: 's2',
      parentStepId: 's1',
      kind: 'tool',
      agentName: 'Triage',
      output: 'fhir result',
      citations: [],
      startedAt: '2026-04-26T00:00:00Z',
      completedAt: '2026-04-26T00:00:00Z',
    },
  ],
  totals: {
    llmCalls: 1,
    toolCalls: 1,
    promptTokens: 100,
    completionTokens: 50,
    estimatedCostUsd: 0.0123,
    wallClockSeconds: 1.2,
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AgentTraceViewer', () => {
  it('renders trace tree, citations, and cost strip after fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(trace) })
    ) as unknown as typeof fetch;

    render(<AgentTraceViewer sessionId="abc" pollMs={0} />);

    await waitFor(() => {
      expect(screen.getByText('Agent trace')).toBeInTheDocument();
    });
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('Protocol')).toBeInTheDocument();
    // cost strip shows total tokens (100+50=150)
    expect(screen.getByText(/Tokens: 150/)).toBeInTheDocument();
    expect(screen.getByText(/Cost: \$0\.0123/)).toBeInTheDocument();
  });

  it('shows error alert on fetch failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, statusText: 'boom', text: () => Promise.resolve('boom') })
    ) as unknown as typeof fetch;

    render(<AgentTraceViewer sessionId="abc" pollMs={0} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('submits clinician feedback after rating selection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trace) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AgentTraceViewer sessionId="abc" pollMs={0} />);

    await waitFor(() => screen.getByText('Was this helpful?'));
    fireEvent.click(screen.getByLabelText('Rate 5 of 5'));
    fireEvent.click(screen.getByText('Send feedback'));

    await waitFor(() => {
      expect(screen.getByText('Feedback recorded.')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toMatch(/feedback/);
  });
});
