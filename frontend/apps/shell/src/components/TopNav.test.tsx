import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopNav } from './TopNav';

const mockToggleMode = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();
const mockUseColorMode = vi.fn();

vi.mock('@healthcare/design-system', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useColorMode: () => mockUseColorMode(),
}));

vi.mock('@healthcare/auth-client', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./Sidebar', () => ({
  SidebarMenuButton: () => <button aria-label="menu">Menu</button>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseColorMode.mockReturnValue({ mode: 'light', toggleMode: mockToggleMode });
  mockUseAuth.mockReturnValue({
    session: null,
    isAuthenticated: false,
    signIn: mockSignIn,
    signOut: mockSignOut,
  });
});

describe('TopNav — unauthenticated', () => {
  it('renders the platform title', () => {
    render(<TopNav />);
    expect(screen.getByText('topnav.platformTitle')).toBeInTheDocument();
  });

  it('renders a colour mode toggle button', () => {
    render(<TopNav />);
    expect(screen.getByLabelText('toggle colour mode')).toBeInTheDocument();
  });

  it('calls toggleMode when colour mode button is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    await user.click(screen.getByLabelText('toggle colour mode'));
    expect(mockToggleMode).toHaveBeenCalledTimes(1);
  });

  it('shows Sign In button when not authenticated', () => {
    render(<TopNav />);
    expect(screen.getByRole('button', { name: 'topnav.signIn' })).toBeInTheDocument();
  });

  it('calls signIn when Sign In button is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    await user.click(screen.getByRole('button', { name: 'topnav.signIn' }));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});

describe('TopNav — authenticated', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      session: { name: 'Dr. Admin', email: 'admin@healthq.io', role: 'Admin', id: '1', accessToken: 'tok' },
      isAuthenticated: true,
      signIn: mockSignIn,
      signOut: mockSignOut,
    });
  });

  it('shows user name when authenticated', () => {
    render(<TopNav />);
    expect(screen.getByText('Dr. Admin')).toBeInTheDocument();
  });

  it('shows Sign Out button when authenticated', () => {
    render(<TopNav />);
    expect(screen.getByRole('button', { name: 'topnav.signOut' })).toBeInTheDocument();
  });

  it('calls signOut when Sign Out is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    await user.click(screen.getByRole('button', { name: 'topnav.signOut' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('does not show Sign In button when authenticated', () => {
    render(<TopNav />);
    expect(screen.queryByRole('button', { name: 'topnav.signIn' })).not.toBeInTheDocument();
  });
});
