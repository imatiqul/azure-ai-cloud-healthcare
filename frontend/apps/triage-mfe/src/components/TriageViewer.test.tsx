import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TriageViewer } from './TriageViewer';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('TriageViewer', () => {
  it('shows empty state when no workflows', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<TriageViewer />);
    await waitFor(() => {
      expect(screen.getByText('No triage workflows yet')).toBeInTheDocument();
    });
  });

  it('renders workflow cards after fetch', async () => {
    const workflows = [
      { id: '1', sessionId: 'abcdefgh-1234', status: 'Completed', triageLevel: 'P3_Standard', createdAt: '2025-01-01T00:00:00Z' },
      { id: '2', sessionId: '12345678-abcd', status: 'AwaitingHumanReview', triageLevel: 'P1_Immediate', createdAt: '2025-01-02T00:00:00Z' },
    ];
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(workflows) })
    ) as unknown as typeof fetch;

    render(<TriageViewer />);
    await waitFor(() => {
      expect(screen.getByText('P3_Standard')).toBeInTheDocument();
    });
    expect(screen.getByText('P1_Immediate')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('AwaitingHumanReview')).toBeInTheDocument();
  });

  it('shows Review & Approve button for AwaitingHumanReview', async () => {
    const workflows = [
      { id: '1', sessionId: 'abcdefgh-1234', status: 'AwaitingHumanReview', triageLevel: 'P1_Immediate', createdAt: '2025-01-01T00:00:00Z' },
    ];
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(workflows) })
    ) as unknown as typeof fetch;

    render(<TriageViewer />);
    await waitFor(() => {
      expect(screen.getByText('Review & Approve')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;
    render(<TriageViewer />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load triage workflows. Retrying automatically.')).toBeInTheDocument();
    });
  });
});
