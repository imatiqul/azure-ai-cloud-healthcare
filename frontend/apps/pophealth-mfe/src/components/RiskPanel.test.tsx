import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RiskPanel } from './RiskPanel';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

describe('RiskPanel', () => {
  it('shows empty state when no risks', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ patientRisks: [] });
    render(<RiskPanel />);
    await waitFor(() => {
      expect(screen.getByText('No risk assessments')).toBeInTheDocument();
    });
  });

  it('renders risk cards after fetch', async () => {
    const risks = [
      { id: '1', patientId: 'PAT-001-XYZ', level: 'Critical', riskScore: 0.92, assessedAt: '2025-01-01T00:00:00Z' },
      { id: '2', patientId: 'PAT-002-ABC', level: 'Low', riskScore: 0.15, assessedAt: '2025-01-01T00:00:00Z' },
    ];
    vi.mocked(gqlFetch).mockResolvedValue({ patientRisks: risks });
    render(<RiskPanel />);
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders the Patient Risk Stratification header', () => {
    vi.mocked(gqlFetch).mockResolvedValue({ patientRisks: [] });
    render(<RiskPanel />);
    expect(screen.getByText('Patient Risk Stratification')).toBeInTheDocument();
  });

  it('renders filter dropdown', () => {
    vi.mocked(gqlFetch).mockResolvedValue({ patientRisks: [] });
    render(<RiskPanel />);
    expect(screen.getByText('All Levels')).toBeInTheDocument();
  });
});
