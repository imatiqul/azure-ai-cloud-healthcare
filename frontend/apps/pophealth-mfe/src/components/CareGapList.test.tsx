import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CareGapList } from './CareGapList';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

describe('CareGapList', () => {
  it('shows demo gaps when API returns empty list', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ careGaps: [] });
    render(<CareGapList />);
    await waitFor(() => {
      expect(screen.getByText(/HbA1c Control/)).toBeInTheDocument();
    });
  });

  it('renders care gap items after fetch', async () => {
    const gaps = [
      { id: '1', patientId: 'PAT-001-XYZ', measureName: 'HBA1C', status: 'Open', identifiedAt: '2025-01-01T00:00:00Z' },
      { id: '2', patientId: 'PAT-002-ABC', measureName: 'EYE-EXAM', status: 'Open', identifiedAt: '2025-01-02T00:00:00Z' },
    ];
    vi.mocked(gqlFetch).mockResolvedValue({ careGaps: gaps });
    render(<CareGapList />);
    await waitFor(() => {
      expect(screen.getByText('HBA1C')).toBeInTheDocument();
    });
    expect(screen.getByText('EYE-EXAM')).toBeInTheDocument();
  });

  it('renders Open Care Gaps header', () => {
    vi.mocked(gqlFetch).mockResolvedValue({ careGaps: [] });
    render(<CareGapList />);
    expect(screen.getByText('Open Care Gaps')).toBeInTheDocument();
  });

  it('renders Address button for each gap', async () => {
    const gaps = [
      { id: '1', patientId: 'PAT-001-XYZ', measureName: 'HBA1C', status: 'Open', identifiedAt: '2025-01-01T00:00:00Z' },
    ];
    vi.mocked(gqlFetch).mockResolvedValue({ careGaps: gaps });
    render(<CareGapList />);
    await waitFor(() => {
      expect(screen.getByText('Address')).toBeInTheDocument();
    });
  });
});
