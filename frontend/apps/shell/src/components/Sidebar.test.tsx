import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
