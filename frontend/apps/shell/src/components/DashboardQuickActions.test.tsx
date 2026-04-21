import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardQuickActions } from './DashboardQuickActions';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@healthcare/design-system', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderQuickActions() {
  return render(
    <MemoryRouter>
      <DashboardQuickActions />
    </MemoryRouter>
  );
}

describe('DashboardQuickActions', () => {
  it('renders the Quick Actions heading', () => {
    renderQuickActions();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('renders all 4 action tiles', () => {
    renderQuickActions();
    expect(screen.getByRole('button', { name: /start voice session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new triage session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /book appointment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register patient/i })).toBeInTheDocument();
  });

  it('navigates to /voice when Start Voice Session is clicked', () => {
    renderQuickActions();
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/voice');
  });

  it('navigates to /triage when New Triage Session is clicked', () => {
    renderQuickActions();
    fireEvent.click(screen.getByRole('button', { name: /new triage session/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/triage');
  });

  it('navigates to /scheduling when Book Appointment is clicked', () => {
    renderQuickActions();
    fireEvent.click(screen.getByRole('button', { name: /book appointment/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/scheduling');
  });

  it('navigates to /patient-portal when Register Patient is clicked', () => {
    renderQuickActions();
    fireEvent.click(screen.getByRole('button', { name: /register patient/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/patient-portal');
  });

  it('renders subtitle text for each action', () => {
    renderQuickActions();
    expect(screen.getByText(/dictate notes or begin voice triage/i)).toBeInTheDocument();
    expect(screen.getByText(/ai-assisted clinical triage/i)).toBeInTheDocument();
    expect(screen.getByText(/schedule a patient slot/i)).toBeInTheDocument();
    expect(screen.getByText(/add a new patient record/i)).toBeInTheDocument();
  });
});
