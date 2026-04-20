import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrugInteractionChecker } from './DrugInteractionChecker';

const mockResultWithInteractions = {
  drugs: ['Warfarin', 'Aspirin'],
  alertLevel: 'Major',
  hasContraindication: false,
  hasMajorInteraction: true,
  interactionCount: 1,
  interactions: [
    {
      drug1: 'Warfarin',
      drug2: 'Aspirin',
      severity: 'Major',
      description: 'Increased bleeding risk — avoid concurrent use without close monitoring.',
    },
  ],
};

const mockResultNoInteractions = {
  drugs: ['Metformin', 'Lisinopril'],
  alertLevel: 'None',
  hasContraindication: false,
  hasMajorInteraction: false,
  interactionCount: 0,
  interactions: [],
};

describe('DrugInteractionChecker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the Drug Interaction Checker header', () => {
    render(<DrugInteractionChecker />);
    expect(screen.getByText('Drug Interaction Checker')).toBeDefined();
  });

  it('Check Interactions button is disabled with fewer than 2 drugs', () => {
    render(<DrugInteractionChecker />);
    expect(screen.getByRole('button', { name: /check interactions/i })).toBeDisabled();
  });

  it('adds drugs via Enter key and shows them as chips', async () => {
    const user = userEvent.setup();
    render(<DrugInteractionChecker />);

    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Warfarin');
    await user.keyboard('{Enter}');
    expect(screen.getByText('Warfarin')).toBeDefined();
  });

  it('removes a drug chip on delete click', async () => {
    const user = userEvent.setup();
    render(<DrugInteractionChecker />);

    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Warfarin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('Warfarin')).toBeDefined();

    const deleteBtn = screen.getByRole('button', { name: /warfarin/i });
    await user.click(deleteBtn);
    expect(screen.queryByText('Warfarin')).toBeNull();
  });

  it('POSTs drugs array to the drug-interactions endpoint', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResultWithInteractions),
    });

    render(<DrugInteractionChecker />);

    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Warfarin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Aspirin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /check interactions/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/population-health/drug-interactions/check');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.drugs).toContain('Warfarin');
    expect(body.drugs).toContain('Aspirin');
  });

  it('displays interaction table with severity badge and description', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResultWithInteractions),
    });

    render(<DrugInteractionChecker />);
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Warfarin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Aspirin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /check interactions/i }));

    await waitFor(() => expect(screen.getByText('Warfarin + Aspirin')).toBeDefined());
    expect(screen.getAllByText('Major').length).toBeGreaterThan(0);
    expect(screen.getByText(/increased bleeding risk/i)).toBeDefined();
  });

  it('shows no interactions message when result is empty', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResultNoInteractions),
    });

    render(<DrugInteractionChecker />);
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Metformin');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'Lisinopril');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /check interactions/i }));

    await waitFor(() =>
      expect(screen.getByText(/no significant interactions detected/i)).toBeDefined(),
    );
  });

  it('shows error alert on HTTP failure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({}),
    });

    render(<DrugInteractionChecker />);
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'DrugA');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByPlaceholderText(/warfarin/i), 'DrugB');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /check interactions/i }));

    await waitFor(() => expect(screen.getByText(/http 400/i)).toBeDefined());
  });
});
