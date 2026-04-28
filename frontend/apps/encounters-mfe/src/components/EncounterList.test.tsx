import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { EncounterList } from './EncounterList';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

expect.extend(toHaveNoViolations);

const makeEncounters = () => [
  {
    id: 'enc-1',
    patientId: 'PAT-123',
    patientName: 'Test Patient',
    status: 'finished',
    encounterType: 'Ambulatory',
    reasonText: 'Annual checkup',
    startedAt: '2026-01-15T10:00:00Z',
    endedAt: null,
  },
  {
    id: 'enc-2',
    patientId: 'PAT-123',
    patientName: 'Test Patient',
    status: 'in-progress',
    encounterType: 'Emergency',
    reasonText: null,
    startedAt: '2026-04-01T08:30:00Z',
    endedAt: null,
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

describe('EncounterList', () => {
  it('renders the patient ID search form', () => {
    render(<EncounterList />);
    expect(screen.getByLabelText(/patient id/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
  });

  it('shows empty state before a search', () => {
    render(<EncounterList />);
    expect(screen.getByText(/enter a patient id/i)).toBeInTheDocument();
  });

  it('fetches and renders encounters after a search', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValue({ encounters: makeEncounters() });

    render(<EncounterList />);
    const input = screen.getByLabelText(/patient id/i);
    await user.type(input, 'PAT-123');
    await user.click(screen.getByRole('button', { name: /load/i }));

    // Status text appears in both filter chips and badge (multiple elements each)
    await waitFor(() => screen.getAllByText('finished'));
    expect(screen.getAllByText('in-progress')).not.toHaveLength(0);
    expect(screen.getByText('Annual checkup')).toBeInTheDocument();
  });

  it('falls back to demo encounters on fetch failure', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockRejectedValue(new Error('Network error'));

    render(<EncounterList />);
    await user.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    await user.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => screen.getAllByText('in-progress'));
    expect(screen.queryByText(/http 500/i)).not.toBeInTheDocument();
  });

  it('opens the create encounter modal', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValue({ encounters: [makeEncounters()[0]] });

    render(<EncounterList />);
    await user.type(screen.getByLabelText(/patient id/i), 'PAT-123');
    await user.click(screen.getByRole('button', { name: /load/i }));
    await waitFor(() => screen.getAllByText('finished'));

    await user.click(screen.getByRole('button', { name: /new encounter/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<main><EncounterList /></main>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
