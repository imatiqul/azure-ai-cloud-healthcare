import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoLanding from './DemoLanding';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
  sessionStorage.clear();
});

describe('DemoLanding', () => {
  it('renders the demo landing page', () => {
    render(<DemoLanding />);
    expect(screen.getByText('HealthQ Copilot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Guided Demo/ })).toBeInTheDocument();
  });

  it('shows name and company fields', () => {
    render(<DemoLanding />);
    expect(screen.getByLabelText(/Your Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  it('shows error when name or company is empty', async () => {
    const user = userEvent.setup({ delay: null });
    render(<DemoLanding />);
    await user.click(screen.getByRole('button', { name: /Start Guided Demo/ }));
    expect(screen.getByText(/Please enter your name and company/)).toBeInTheDocument();
  });

  it('calls start API and navigates on success', async () => {
    const user = userEvent.setup({ delay: null });
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'sess-1',
          guideSessionId: 'guide-1',
          currentStep: 'Welcome',
          narration: 'Welcome!',
          stepInfo: null,
        }),
      })
    ) as unknown as typeof fetch;

    render(<DemoLanding />);
    await user.type(screen.getByLabelText(/Your Name/), 'John Doe');
    await user.type(screen.getByLabelText(/Company/), 'Acme Health');
    await user.click(screen.getByRole('button', { name: /Start Guided Demo/ }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/demo/live');
    });
    const stored = JSON.parse(sessionStorage.getItem('demo')!);
    expect(stored.sessionId).toBe('sess-1');
    expect(stored.clientName).toBe('John Doe');
  });

  it('shows error message when API call fails', async () => {
    const user = userEvent.setup({ delay: null });
    global.fetch = vi.fn(() => Promise.resolve({ ok: false })) as unknown as typeof fetch;

    render(<DemoLanding />);
    await user.type(screen.getByLabelText(/Your Name/), 'Jane');
    await user.type(screen.getByLabelText(/Company/), 'HealthCorp');
    await user.click(screen.getByRole('button', { name: /Start Guided Demo/ }));

    await waitFor(() => {
      expect(screen.getByText(/Could not start the demo/)).toBeInTheDocument();
    });
  });

  it('shows "Starting Demo..." while loading', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const user = userEvent.setup({ delay: null });

    render(<DemoLanding />);
    await user.type(screen.getByLabelText(/Your Name/), 'Test');
    await user.type(screen.getByLabelText(/Company/), 'Corp');
    await user.click(screen.getByRole('button', { name: /Start Guided Demo/ }));

    expect(screen.getByText('Starting Demo...')).toBeInTheDocument();
  });
});
