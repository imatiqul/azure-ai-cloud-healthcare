import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoLive from './DemoLive';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../components/FeedbackDialog', () => ({
  FeedbackDialog: () => null,
}));

vi.mock('../components/OverallFeedbackDialog', () => ({
  OverallFeedbackDialog: () => null,
}));

const DEMO_STATE = {
  sessionId: 'sess-demo-1',
  guideSessionId: 'guide-1',
  currentStep: 'Welcome',
  narration: 'Welcome to HealthQ Copilot!',
  stepInfo: {
    step: 'Welcome',
    title: 'Welcome',
    feedbackQuestion: 'How was the welcome?',
    feedbackTags: ['Clear', 'Concise'],
  },
  clientName: 'John Demo',
  company: 'Acme Health',
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
  sessionStorage.clear();
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          sessionId: DEMO_STATE.sessionId,
          narration: 'Step advanced!',
          stepInfo: { step: 'VoiceIntake', title: 'Voice Intake Demo', feedbackQuestion: 'Q?', feedbackTags: [] },
          isComplete: false,
        }),
    })
  ) as unknown as typeof fetch;
});

describe('DemoLive', () => {
  it('redirects to /demo when no session is stored', () => {
    render(<DemoLive />);
    expect(mockNavigate).toHaveBeenCalledWith('/demo');
  });

  it('renders the stepper with step labels when session is present', async () => {
    sessionStorage.setItem('demo', JSON.stringify(DEMO_STATE));
    render(<DemoLive />);
    await waitFor(() => {
      expect(screen.getByText('Welcome')).toBeInTheDocument();
    });
    expect(screen.getByText('Voice Intake')).toBeInTheDocument();
    expect(screen.getByText('AI Triage')).toBeInTheDocument();
    expect(screen.getByText('Scheduling')).toBeInTheDocument();
  });

  it('renders client name and company in the header', async () => {
    sessionStorage.setItem('demo', JSON.stringify(DEMO_STATE));
    render(<DemoLive />);
    await waitFor(() => {
      expect(screen.getByText(/John Demo/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Acme Health/)).toBeInTheDocument();
  });

  it('renders narration text from stored session', async () => {
    sessionStorage.setItem('demo', JSON.stringify(DEMO_STATE));
    render(<DemoLive />);
    await waitFor(() => {
      expect(screen.getByText('Welcome to HealthQ Copilot!')).toBeInTheDocument();
    });
  });

  it('calls advance API when Next button is clicked', async () => {
    sessionStorage.setItem('demo', JSON.stringify(DEMO_STATE));
    const user = userEvent.setup();
    render(<DemoLive />);
    await waitFor(() => {
      expect(screen.getByText('Welcome to HealthQ Copilot!')).toBeInTheDocument();
    });
    const nextButton = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/sess-demo-1/next`),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows step counter chip', async () => {
    sessionStorage.setItem('demo', JSON.stringify(DEMO_STATE));
    render(<DemoLive />);
    await waitFor(() => {
      expect(screen.getByText(/Step \d+ of 6/)).toBeInTheDocument();
    });
  });
});
