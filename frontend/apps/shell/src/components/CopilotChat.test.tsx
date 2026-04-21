import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopilotChat } from './CopilotChat';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'copilot.title': 'AI Clinical Workflow Guide',
      'copilot.subtitle': 'Powered by HealthQ AI',
      'copilot.greeting': "I'm your HealthQ Copilot. How can I help?",
      'copilot.tryOne': 'Try one of these:',
      'copilot.send': 'Send',
      'copilot.inputPlaceholder': 'Ask anything…',
    }[key] ?? key),
  }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockClear();
  global.fetch = vi.fn((url: string) => {
    if (url.includes('/suggestions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          { id: '1', text: 'Show triage', description: 'View triage workflows' },
          { id: '2', text: 'Show scheduling', description: 'View appointments' },
        ]),
      });
    }
    if (url.includes('/chat')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'guide-session-1',
          message: 'Here is the triage module overview.',
          suggestedRoute: '/triage',
        }),
      });
    }
    return Promise.resolve({ ok: false });
  }) as unknown as typeof fetch;
});

describe('CopilotChat', () => {
  it('renders the FAB button', () => {
    render(<CopilotChat />);
    expect(screen.getByLabelText('Open HealthQ Copilot')).toBeInTheDocument();
  });

  it('opens the chat drawer when FAB is clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);
    await user.click(screen.getByLabelText('Open HealthQ Copilot'));
    expect(screen.getByText('AI Clinical Workflow Guide')).toBeInTheDocument();
  });

  it('loads suggestions when opened', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);
    await user.click(screen.getByLabelText('Open HealthQ Copilot'));
    await waitFor(() => {
      expect(screen.getByText('Show triage')).toBeInTheDocument();
    });
  });

  it('shows welcome text in empty state', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);
    await user.click(screen.getByLabelText('Open HealthQ Copilot'));
    expect(screen.getByText(/I'm your HealthQ Copilot/)).toBeInTheDocument();
  });
});
