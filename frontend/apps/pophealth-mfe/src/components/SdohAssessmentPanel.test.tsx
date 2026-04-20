import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SdohAssessmentPanel } from './SdohAssessmentPanel';

const mockAssessmentResult = {
  id: 'sdoh-1',
  patientId: 'P-001',
  totalScore: 10,
  riskLevel: 'Moderate',
  compositeRiskWeight: 0.42,
  domainScores: { HousingInstability: 3, FoodInsecurity: 2, Transportation: 1, SocialIsolation: 1,
    FinancialStrain: 1, Employment: 1, Education: 1, DigitalAccess: 0 },
  prioritizedNeeds: ['HousingInstability', 'FoodInsecurity'],
  recommendedActions: ['Refer to housing assistance', 'Connect with food bank'],
  assessedAt: '2026-04-21T10:00:00Z',
};

describe('SdohAssessmentPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the SDOH screening header', () => {
    render(<SdohAssessmentPanel />);
    expect(screen.getByText('SDOH Screening Assessment')).toBeDefined();
  });

  it('disables Submit Assessment when Patient ID is empty', () => {
    render(<SdohAssessmentPanel />);
    const btn = screen.getByRole('button', { name: /submit assessment/i });
    expect(btn).toBeDisabled();
  });

  it('does not show Load Latest button when Patient ID is empty', () => {
    render(<SdohAssessmentPanel />);
    expect(screen.queryByRole('button', { name: /load latest/i })).toBeNull();
  });

  it('POSTs correct payload on form submit', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssessmentResult),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/population-health/sdoh');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.patientId).toBe('P-001');
    expect(typeof body.domainScores).toBe('object');
  });

  it('displays assessment results including totalScore and riskLevel', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssessmentResult),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getByText(/total score: 10\/24/i)).toBeDefined());
    expect(screen.getByText(/risk: moderate/i)).toBeDefined();
    expect(screen.getByText(/risk weight: 42%/i)).toBeDefined();
  });

  it('displays prioritized needs as badges', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssessmentResult),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getByText('Housing Instability')).toBeDefined());
    expect(screen.getByText('Food Insecurity')).toBeDefined();
  });

  it('displays recommended actions', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssessmentResult),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() =>
      expect(screen.getByText(/refer to housing assistance/i)).toBeDefined(),
    );
    expect(screen.getByText(/connect with food bank/i)).toBeDefined();
  });

  it('shows error alert on HTTP failure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getByText(/http 500/i)).toBeDefined());
  });

  it('calls GET /sdoh/{patientId} when Load Latest is clicked', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAssessmentResult),
    });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');

    const loadBtn = screen.getByRole('button', { name: /load latest/i });
    await user.click(loadBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/population-health/sdoh/P-001');
  });
});
