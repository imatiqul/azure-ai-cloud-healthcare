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
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
  }) => <button onClick={onClick} aria-label={ariaLabel}>{children}</button>,
}));

// Auth mock — use a factory fn so we can change return values per test
const mockSignOut = vi.fn();
const mockSignIn  = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@healthcare/auth-client', () => ({
  useAuth: () => mockUseAuth(),
}));

import UserProfile from './UserProfile';

function renderPage() {
  return render(
    <MemoryRouter>
      <UserProfile />
    </MemoryRouter>
  );
}

describe('UserProfile — authenticated', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockUseAuth.mockReturnValue({
      session: {
        name:  'Dr. Alice Smith',
        email: 'alice@healthq.ai',
        role:  'Clinician',
        exp:   9999999999,
      },
      isAuthenticated: true,
      signOut: mockSignOut,
      signIn:  mockSignIn,
    });
  });

  it('renders the My Profile heading', () => {
    renderPage();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
  });

  it('displays the user display name', () => {
    renderPage();
    expect(screen.getByText('Dr. Alice Smith')).toBeInTheDocument();
  });

  it('displays the user email', () => {
    renderPage();
    expect(screen.getAllByText('alice@healthq.ai').length).toBeGreaterThan(0);
  });

  it('shows Authenticated chip', () => {
    renderPage();
    expect(screen.getByText('Authenticated')).toBeInTheDocument();
  });

  it('shows role chip', () => {
    renderPage();
    // Role appears in both the identity chip and the session table
    expect(screen.getAllByText('Clinician').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Session Information section', () => {
    renderPage();
    expect(screen.getByText('Session Information')).toBeInTheDocument();
    expect(screen.getByText('Session expires')).toBeInTheDocument();
  });

  it('renders Platform Settings quick action button', () => {
    renderPage();
    expect(screen.getByLabelText('go to settings')).toBeInTheDocument();
  });

  it('calls signOut when Sign Out button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByLabelText('sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('UserProfile — unauthenticated', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      session: null,
      isAuthenticated: false,
      signOut: vi.fn(),
      signIn:  mockSignIn,
    });
  });

  it('shows sign-in prompt when not authenticated', () => {
    renderPage();
    expect(screen.getByText(/You are not signed in/i)).toBeInTheDocument();
  });

  it('does not render the My Profile heading when unauthenticated', () => {
    renderPage();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });
});
