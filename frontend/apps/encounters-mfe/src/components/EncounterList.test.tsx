import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { EncounterList } from './EncounterList';

expect.extend(toHaveNoViolations);

const makeBundle = (encounters: object[]) => ({
  resourceType: 'Bundle',
  entry: encounters.map((resource) => ({ resource })),
});

beforeEach(() => {
  vi.restoreAllMocks();
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
    const encounters = [
      {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'finished',
        period: { start: '2026-01-15T10:00:00Z' },
        class: { code: 'AMB', display: 'Ambulatory' },
        reasonCode: [{ coding: [{ display: 'Annual checkup' }] }],
      },
      {
        resourceType: 'Encounter',
        id: 'enc-2',
        status: 'in-progress',
        period: { start: '2026-04-01T08:30:00Z' },
        class: { code: 'EMER', display: 'Emergency' },
      },
    ];
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeBundle(encounters)) })
    ) as unknown as typeof fetch;

    render(<EncounterList />);
    const input = screen.getByLabelText(/patient id/i);
    await user.type(input, 'PAT-123');
    await user.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('finished')).toBeInTheDocument();
    });
    expect(screen.getByText('in-progress')).toBeInTheDocument();
    expect(screen.getByText('Annual checkup')).toBeInTheDocument();
  });

  it('falls back to demo encounters on fetch failure', async () => {
    const user = userEvent.setup({ delay: null });
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 })) as unknown as typeof fetch;

    render(<EncounterList />);
    await user.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    await user.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('in-progress')).toBeInTheDocument();
    });
    expect(screen.queryByText(/http 500/i)).not.toBeInTheDocument();
  });

  it('opens the create encounter modal', async () => {
    const user = userEvent.setup({ delay: null });
    const encounters = [
      {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'finished',
        period: { start: '2026-01-15T10:00:00Z' },
        class: { code: 'AMB', display: 'Ambulatory' },
      },
    ];
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(makeBundle(encounters)) })
    ) as unknown as typeof fetch;

    render(<EncounterList />);
    await user.type(screen.getByLabelText(/patient id/i), 'PAT-123');
    await user.click(screen.getByRole('button', { name: /load/i }));
    await waitFor(() => screen.getByText('finished'));

    await user.click(screen.getByRole('button', { name: /new encounter/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<main><EncounterList /></main>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
