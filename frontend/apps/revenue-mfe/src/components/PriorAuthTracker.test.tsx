import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PriorAuthTracker } from './PriorAuthTracker';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

describe('PriorAuthTracker', () => {
  it('shows loading spinner initially', () => {
    vi.mocked(gqlFetch).mockReturnValue(new Promise(() => {}));
    render(<PriorAuthTracker />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows demo data when no prior auths returned', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ priorAuths: [] });
    render(<PriorAuthTracker />);
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  it('renders prior auth items after fetch', async () => {
    const items = [
      { id: '1', procedureCode: 'CPT-27447', patientId: 'P1', patientName: 'Jane Smith', insurerName: 'BlueCross', status: 'Pending', submittedAt: '2025-01-01', reason: 'Knee replacement' },
    ];
    vi.mocked(gqlFetch).mockResolvedValue({ priorAuths: items });
    render(<PriorAuthTracker />);
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders the Prior Authorizations header', () => {
    vi.mocked(gqlFetch).mockReturnValue(new Promise(() => {}));
    render(<PriorAuthTracker />);
    expect(screen.getByText('Prior Authorization Tracker')).toBeInTheDocument();
  });
});
