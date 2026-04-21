import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TopNav } from './TopNav';

const mockToggleMode = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();
const mockUseColorMode = vi.fn();
const mockOpenSearch = vi.fn();

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

// Mock fetch so live alert calls don't fail in tests
global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null }) as any;

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

function renderTopNav(props = {}) {
  return render(
    <MemoryRouter>
      <TopNav onOpenSearch={mockOpenSearch} {...props} />
    </MemoryRouter>
  );
}

describe('TopNav — unauthenticated', () => {
  it('renders the platform title', () => {
    renderTopNav();
    expect(screen.getByText('topnav.platformTitle')).toBeInTheDocument();
  });

  it('renders a colour mode toggle button', () => {
    renderTopNav();
    expect(screen.getByLabelText('toggle colour mode')).toBeInTheDocument();
  });

  it('calls toggleMode when colour mode button is clicked', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByLabelText('toggle colour mode'));
    expect(mockToggleMode).toHaveBeenCalledTimes(1);
  });

  it('shows Sign In button when not authenticated', () => {
    renderTopNav();
    expect(screen.getByRole('button', { name: 'topnav.signIn' })).toBeInTheDocument();
  });

  it('calls signIn when Sign In button is clicked', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByRole('button', { name: 'topnav.signIn' }));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders a search button on mobile', () => {
    renderTopNav();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('calls onOpenSearch when search button is clicked', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByLabelText('Search'));
    expect(mockOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('renders a search bar with "Ctrl K" chip on desktop', () => {
    renderTopNav();
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
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

  it('shows user name when authenticated', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByRole('button', { name: 'User menu' }));
    expect(await screen.findByText('Dr. Admin')).toBeInTheDocument();
  });

  it('shows Sign Out button when authenticated', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByRole('button', { name: 'User menu' }));
    expect(await screen.findByText('topnav.signOut')).toBeInTheDocument();
  });

  it('calls signOut when Sign Out is clicked', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByRole('button', { name: 'User menu' }));
    await user.click(await screen.findByText('topnav.signOut'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('does not show Sign In button when authenticated', () => {
    renderTopNav();
    expect(screen.queryByRole('button', { name: 'topnav.signIn' })).not.toBeInTheDocument();
  });

  it('renders notifications button when authenticated', () => {
    renderTopNav();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('renders "All clear" when no alerts from API', async () => {
    const user = userEvent.setup();
    renderTopNav();
    await user.click(screen.getByLabelText('Notifications'));
    await waitFor(() => {
      expect(screen.getByText('All clear — no active alerts')).toBeInTheDocument();
    });
  });
});
