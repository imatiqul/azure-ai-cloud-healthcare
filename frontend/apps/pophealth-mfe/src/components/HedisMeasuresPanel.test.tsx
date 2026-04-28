import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HedisMeasuresPanel } from './HedisMeasuresPanel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const HEDIS_RESPONSE = {
  patientId: 'pat-001',
  measureResults: [
    {
      measureId: 'CDC-HbA1c',
      measureName: 'Diabetes HbA1c Control',
      inDenominator: true,
      inNumerator: true,
      hasExclusion: false,
      hasCareGap: false,
      careGapDescription: null,
      recommendedAction: null,
    },
    {
      measureId: 'CBP',
      measureName: 'Controlling Blood Pressure',
      inDenominator: true,
      inNumerator: false,
      hasExclusion: false,
      hasCareGap: true,
      careGapDescription: 'Blood pressure not controlled in last 12 months',
      recommendedAction: 'Schedule follow-up BP check',
    },
    {
      measureId: 'BCS',
      measureName: 'Breast Cancer Screening',
      inDenominator: false,
      inNumerator: false,
      hasExclusion: false,
      hasCareGap: false,
      careGapDescription: null,
      recommendedAction: null,
    },
  ],
  totalMeasures: 2,
  careGapCount: 1,
  compliantCount: 1,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('HedisMeasuresPanel', () => {
  it('renders heading', () => {
    render(<HedisMeasuresPanel />);
    expect(screen.getByText('HEDIS Quality Measures')).toBeInTheDocument();
  });

  it('renders patient ID field and evaluate button', () => {
    render(<HedisMeasuresPanel />);
    expect(screen.getByLabelText(/patient id/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evaluate hedis measures/i })).toBeInTheDocument();
  });

  it('evaluate button is disabled with no patient ID', () => {
    render(<HedisMeasuresPanel />);
    expect(screen.getByRole('button', { name: /evaluate hedis measures/i })).toBeDisabled();
  });

  it('calls POST /patients/{id}/hedis with body on evaluate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(HEDIS_RESPONSE),
    });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-001');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/population-health/patients/pat-001/hedis'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"age"'),
        }),
      );
    });
  });

  it('displays measure results after successful evaluation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(HEDIS_RESPONSE),
    });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-001');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => screen.getByText('Diabetes HbA1c Control'));
    expect(screen.getByText('Controlling Blood Pressure')).toBeInTheDocument();
  });

  it('shows care gap count and compliance chips', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(HEDIS_RESPONSE),
    });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-001');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => screen.getByText('1 care gaps'));
    expect(screen.getByText('2 measures')).toBeInTheDocument();
    expect(screen.getByText('1 compliant')).toBeInTheDocument();
  });

  it('shows Compliant badge for passing measure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(HEDIS_RESPONSE),
    });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-001');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => screen.getByText('Compliant'));
    expect(screen.getByText('Care Gap')).toBeInTheDocument();
  });

  it('shows care gap description and recommended action', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(HEDIS_RESPONSE),
    });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-001');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => screen.getByText(/blood pressure not controlled/i));
    expect(screen.getByText(/Schedule follow-up BP check/)).toBeInTheDocument();
  });

  it('shows error alert on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });

    render(<HedisMeasuresPanel />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'pat-999');
    fireEvent.click(screen.getByRole('button', { name: /evaluate hedis measures/i }));

    await waitFor(() => screen.getByText(/HEDIS evaluation failed/i));
  });
});
