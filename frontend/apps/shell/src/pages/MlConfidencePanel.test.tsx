import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MlConfidencePanel from './MlConfidencePanel';

describe('MlConfidencePanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders heading and probability input', () => {
    render(<MlConfidencePanel />);
    expect(screen.getByText('ML Readmission Risk Confidence')).toBeInTheDocument();
    expect(screen.getByLabelText('readmission probability')).toBeInTheDocument();
  });

  it('disables Compute button without probability input', () => {
    render(<MlConfidencePanel />);
    expect(screen.getByRole('button', { name: /compute confidence/i })).toBeDisabled();
  });

  it('enables Compute button when valid probability entered', async () => {
    const user = userEvent.setup();
    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.72');
    expect(screen.getByRole('button', { name: /compute confidence/i })).toBeEnabled();
  });

  it('POSTs to /agents/decisions/ml-confidence and shows confidence interval', async () => {
    const user = userEvent.setup();
    const mockResp = {
      probability: 0.72,
      confidenceInterval: {
        predictedProbability: 0.72,
        lowerBound95: 0.58,
        upperBound95: 0.86,
        confidenceLevel: 0.87,
        decisionConfidence: 'High',
        method: 'boundary-distance+feature-stability',
        interpretation: 'High confidence: the model is certain in this prediction.',
      },
      featureImportance: null,
    };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResp),
    } as Response);

    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.72');
    await user.click(screen.getByRole('button', { name: /compute confidence/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/decisions/ml-confidence'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(await screen.findByText('Confidence Interval')).toBeInTheDocument();
    expect(await screen.findByText('72.0%')).toBeInTheDocument();
  });

  it('shows High confidence badge with green styling', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          probability: 0.72,
          confidenceInterval: {
            predictedProbability: 0.72,
            lowerBound95: 0.58,
            upperBound95: 0.86,
            confidenceLevel: 0.87,
            decisionConfidence: 'High',
            method: 'boundary-distance+feature-stability',
            interpretation: 'High confidence.',
          },
          featureImportance: null,
        }),
    } as Response);

    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.72');
    await user.click(screen.getByRole('button', { name: /compute confidence/i }));
    expect(await screen.findByText('High')).toBeInTheDocument();
    expect(await screen.findByText(/High confidence/)).toBeInTheDocument();
  });

  it('shows 95% CI bounds', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          probability: 0.4,
          confidenceInterval: {
            predictedProbability: 0.4,
            lowerBound95: 0.28,
            upperBound95: 0.52,
            confidenceLevel: 0.65,
            decisionConfidence: 'Low',
            method: 'LIME-fallback',
            interpretation: 'Low confidence: boundary proximity is high.',
          },
          featureImportance: null,
        }),
    } as Response);

    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.4');
    await user.click(screen.getByRole('button', { name: /compute confidence/i }));
    expect(await screen.findByText(/95% CI:/)).toBeInTheDocument();
    expect(await screen.findByText('Low')).toBeInTheDocument();
    expect((await screen.findAllByText(/LIME-fallback/)).length).toBeGreaterThan(0);
  });

  it('shows feature importance list when features provided', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          probability: 0.72,
          confidenceInterval: {
            predictedProbability: 0.72,
            lowerBound95: 0.59,
            upperBound95: 0.85,
            confidenceLevel: 0.88,
            decisionConfidence: 'High',
            method: 'boundary-distance+feature-stability',
            interpretation: 'High confidence.',
          },
          featureImportance: {
            baseScore: 0.72,
            explanation: 'Primarily driven by Comorbidity Count.',
            features: [
              {
                featureName: 'Comorbidity Count',
                featureValue: 6,
                meanValue: 2,
                relativeImportance: 0.4,
                direction: 'increases risk',
                estimatedImpact: 0.288,
              },
              {
                featureName: 'Age Bucket',
                featureValue: 1,
                meanValue: 2,
                relativeImportance: 0.25,
                direction: 'decreases risk',
                estimatedImpact: 0.18,
              },
            ],
          },
        }),
    } as Response);

    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.72');
    await user.click(screen.getByRole('button', { name: /compute confidence/i }));
    expect(await screen.findByText('Feature Importance')).toBeInTheDocument();
    expect(await screen.findAllByText('Comorbidity Count')).not.toHaveLength(0);
    expect(await screen.findByText('increases risk')).toBeInTheDocument();
    expect(await screen.findByText('decreases risk')).toBeInTheDocument();
    expect(await screen.findByText(/Primarily driven by/)).toBeInTheDocument();
  });

  it('shows error alert on HTTP 500', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    render(<MlConfidencePanel />);
    await user.type(screen.getByLabelText('readmission probability'), '0.72');
    await user.click(screen.getByRole('button', { name: /compute confidence/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
