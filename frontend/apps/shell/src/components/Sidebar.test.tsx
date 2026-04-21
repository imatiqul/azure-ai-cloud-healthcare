import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, SidebarProvider } from './Sidebar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Use a fixed desktop viewport so Sidebar renders the persistent drawer
vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mui/material')>();
  return {
    ...actual,
    useMediaQuery: () => false, // always desktop
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('renders the brand heading', () => {
    renderSidebar();
    expect(screen.getByText('HealthQ')).toBeInTheDocument();
    expect(screen.getByText('Copilot')).toBeInTheDocument();
  });

  it('renders all 8 navigation items', () => {
    renderSidebar();
    const navLinks = screen.getAllByRole('link');
    // Dashboard, Voice, Triage, Encounters, Scheduling, Population Health, Revenue, Patient Portal
    expect(navLinks.length).toBeGreaterThanOrEqual(8);
  });

  it('renders navigation link to the dashboard', () => {
    renderSidebar();
    const dashboardLinks = screen.getAllByRole('link').filter(el =>
      el.getAttribute('href') === '/'
    );
    expect(dashboardLinks.length).toBeGreaterThan(0);
  });

  it('renders navigation link to scheduling', () => {
    renderSidebar();
    const schedulingLink = screen.getAllByRole('link').find(el =>
      el.getAttribute('href') === '/scheduling'
    );
    expect(schedulingLink).toBeDefined();
  });

  it('renders navigation link to population health', () => {
    renderSidebar();
    const popHealthLink = screen.getAllByRole('link').find(el =>
      el.getAttribute('href') === '/population-health'
    );
    expect(popHealthLink).toBeDefined();
  });

  it('renders navigation link to patient portal', () => {
    renderSidebar();
    const patientPortalLink = screen.getAllByRole('link').find(el =>
      el.getAttribute('href') === '/patient-portal'
    );
    expect(patientPortalLink).toBeDefined();
  });

  it('admin group starts collapsed — admin links are not visible', () => {
    renderSidebar();
    // /admin/users is inside the admin group which starts collapsed
    const adminUsersLink = screen.queryAllByRole('link').find(el =>
      el.getAttribute('href') === '/admin/users'
    );
    expect(adminUsersLink).toBeUndefined();
  });

  it('clicking admin group header expands admin items', () => {
    renderSidebar();
    const adminToggle = screen.getByRole('button', { name: /toggle admin section/i });
    fireEvent.click(adminToggle);
    const adminUsersLink = screen.getAllByRole('link').find(el =>
      el.getAttribute('href') === '/admin/users'
    );
    expect(adminUsersLink).toBeDefined();
  });

  it('shows unread notification badge when there are unread notifications', () => {
    localStorage.setItem(
      'hq:notification-history',
      JSON.stringify([{ read: false }, { read: false }, { read: true }])
    );
    renderSidebar();
    // Badge renders the count as text — 2 unread
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows no notification badge when all notifications are read', () => {
    localStorage.setItem(
      'hq:notification-history',
      JSON.stringify([{ read: true }, { read: true }])
    );
    renderSidebar();
    expect(screen.queryByText(/^[0-9]+$|^99\+$/)).not.toBeInTheDocument();
  });
});
