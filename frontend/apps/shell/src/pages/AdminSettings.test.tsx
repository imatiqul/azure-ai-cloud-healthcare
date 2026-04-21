import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock design-system to avoid @mui/lab/Timeline import error in tests
vi.mock('@healthcare/design-system', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));

import AdminSettings from './AdminSettings';

beforeEach(() => {
  localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminSettings />
    </MemoryRouter>
  );
}

describe('AdminSettings', () => {
  it('renders the main heading', () => {
    renderPage();
    expect(screen.getByText('Admin Settings')).toBeInTheDocument();
  });

  it('renders Platform Information section', () => {
    renderPage();
    expect(screen.getByText('Platform Information')).toBeInTheDocument();
    expect(screen.getByText('HealthQ Copilot')).toBeInTheDocument();
  });

  it('renders Live Alert Preferences section with toggles', () => {
    renderPage();
    expect(screen.getByText('Live Alert Preferences')).toBeInTheDocument();
    expect(screen.getByLabelText('alert-denials')).toBeInTheDocument();
    expect(screen.getByLabelText('alert-triage')).toBeInTheDocument();
    expect(screen.getByLabelText('alert-delivery')).toBeInTheDocument();
  });

  it('toggles persist to localStorage', async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = screen.getByLabelText('alert-denials');
    // Default is true (on); click to turn off
    await user.click(toggle);
    expect(localStorage.getItem('hq:pref:alert-denials')).toBe('false');
  });

  it('shows "Preferences saved" message after toggling', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByLabelText('alert-triage'));
    expect(screen.getByText('Preferences saved')).toBeInTheDocument();
  });

  it('renders Display Preferences section with locale chips', () => {
    renderPage();
    expect(screen.getByText('Display Preferences')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
  });

  it('renders API Configuration section', () => {
    renderPage();
    expect(screen.getByText('API Configuration')).toBeInTheDocument();
    expect(screen.getByText('REST API Base URL')).toBeInTheDocument();
  });

  it('renders Security & Compliance section with links', () => {
    renderPage();
    expect(screen.getByText('Security & Compliance')).toBeInTheDocument();
    expect(screen.getByText('→ PHI Audit Log')).toBeInTheDocument();
    expect(screen.getByText('→ Break-Glass Emergency Access')).toBeInTheDocument();
  });
});
