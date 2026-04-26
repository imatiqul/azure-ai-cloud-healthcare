import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ModelGovernanceDashboard from './ModelGovernanceDashboard';

beforeEach(() => {
  vi.restoreAllMocks();
});

const makeEntries = () => [
  {
    id: 'ent-001',
    modelName: 'gpt-4o-clinical',
    modelVersion: '2024-11-20',
    deploymentName: 'healthq-gpt4o',
    skVersion: '1.24.0',
    promptHash: 'abcdef1234567890',
    lastEvalScore: 0.92,
    deployedAt: '2026-04-01T12:00:00Z',
    isActive: true,
  },
  {
    id: 'ent-002',
    modelName: 'gpt-4o-clinical',
    modelVersion: '2024-08-01',
    deploymentName: 'healthq-gpt4o-v2',
    skVersion: '1.22.0',
    promptHash: 'fedcba0987654321',
    lastEvalScore: 0.78,
    deployedAt: '2026-01-15T09:00:00Z',
    isActive: false,
  },
];

describe('ModelGovernanceDashboard', () => {
  it('renders AI Model Governance heading', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    expect(screen.getByText('AI Model Governance')).toBeInTheDocument();
  });

  it('fetches governance history on mount', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/governance/history'),
        expect.any(Object),
      )
    );
  });

  it('displays model registry entries after load', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeEntries()) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getAllByText('gpt-4o-clinical').length).toBeGreaterThan(0));
  });

  it('shows Active chip for active model entry', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeEntries()) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument());
  });

  it('shows version chips', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeEntries()) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getByText('v2024-11-20')).toBeInTheDocument());
    expect(screen.getByText('v2024-08-01')).toBeInTheDocument();
  });

  it('shows summary KPI cards: Active Models and Total Versions', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeEntries()) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getByText('Active Models')).toBeInTheDocument());
    expect(screen.getByText('Total Versions')).toBeInTheDocument();
  });

  it('shows Model Registry section header', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getByText('Model Registry')).toBeInTheDocument());
  });

  it('falls back to demo entries when API returns an empty list', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getAllByText('ClinicalTriage').length).toBeGreaterThan(0)
    );
  });

  it('falls back to demo entries on HTTP failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(screen.getAllByText('ClinicalTriage').length).toBeGreaterThan(0));
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument();
  });

  it('re-fetches on refresh button click', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;
    render(<ModelGovernanceDashboard />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /refresh governance/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
