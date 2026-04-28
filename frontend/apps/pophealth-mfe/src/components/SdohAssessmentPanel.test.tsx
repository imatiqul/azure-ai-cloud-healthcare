import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SdohAssessmentPanel } from './SdohAssessmentPanel';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

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
    vi.mocked(gqlFetch).mockReset();
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

  it('submits correct payload via gqlFetch', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ scoreSdoh: mockAssessmentResult });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(1));
    expect(gqlFetch).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({
          patientId: 'P-001',
          domainScores: expect.any(Object),
        }),
      }),
    }));
  });

  it('displays assessment results including totalScore and riskLevel', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ scoreSdoh: mockAssessmentResult });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getByText(/total score: 10\/24/i)).toBeDefined());
    expect(screen.getByText(/risk: moderate/i)).toBeDefined();
    expect(screen.getByText(/risk weight: 42%/i)).toBeDefined();
  });

  it('displays prioritized needs as badges', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ scoreSdoh: mockAssessmentResult });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getAllByText('Housing Instability').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Food Insecurity').length).toBeGreaterThan(0);
  });

  it('displays recommended actions', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ scoreSdoh: mockAssessmentResult });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() =>
      expect(screen.getByText(/refer to housing assistance/i)).toBeDefined(),
    );
    expect(screen.getByText(/connect with food bank/i)).toBeDefined();
  });

  it('shows demo result on submit failure', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockRejectedValueOnce(new Error('Server error'));

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));

    await waitFor(() => expect(screen.getByText(/total score/i)).toBeDefined());
  });

  it('calls gqlFetch when Load Latest is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(gqlFetch).mockResolvedValueOnce({ sdohAssessment: mockAssessmentResult });

    render(<SdohAssessmentPanel />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-001');
    const loadBtn = screen.getByRole('button', { name: /load latest/i });
    await user.click(loadBtn);

    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(1));
    expect(gqlFetch).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ patientId: 'P-001' }),
    }));
  });
});
