import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CodingQueue } from './CodingQueue';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

describe('CodingQueue', () => {
  it('shows loading spinner initially', () => {
    vi.mocked(gqlFetch).mockReturnValue(new Promise(() => {}));
    render(<CodingQueue />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows demo data when no coding jobs returned', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ codingJobs: [] });
    render(<CodingQueue />);
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  it('renders coding items after fetch', async () => {
    const items = [
      { id: '1', encounterId: 'ENC-001', patientId: 'P1', patientName: 'John Doe', suggestedCodes: ['J06.9'], approvedCodes: [], status: 'Pending', createdAt: '2025-01-01' },
    ];
    vi.mocked(gqlFetch).mockResolvedValue({ codingJobs: items });
    render(<CodingQueue />);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('J06.9')).toBeInTheDocument();
  });

  it('renders the ICD-10 Coding Queue header', () => {
    vi.mocked(gqlFetch).mockReturnValue(new Promise(() => {}));
    render(<CodingQueue />);
    expect(screen.getByText('ICD-10 Coding Queue')).toBeInTheDocument();
  });
});
