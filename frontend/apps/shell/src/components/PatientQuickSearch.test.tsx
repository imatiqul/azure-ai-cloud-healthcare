import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PatientQuickSearch, loadRecentPatients, saveRecentPatient } from './PatientQuickSearch';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRisks = [
  { id: 'r1', patientId: 'PAT-001', level: 'Critical', riskScore: 0.92, assessedAt: '2026-01-01' },
  { id: 'r2', patientId: 'PAT-002', level: 'High',     riskScore: 0.74, assessedAt: '2026-01-02' },
  { id: 'r3', patientId: 'PAT-003', level: 'Low',      riskScore: 0.18, assessedAt: '2026-01-03' },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockRisks,
  }) as any;
});

function renderSearch() {
  return render(
    <MemoryRouter>
      <PatientQuickSearch />
    </MemoryRouter>
  );
}

describe('PatientQuickSearch', () => {
  it('renders the patient search icon button', () => {
    renderSearch();
    expect(screen.getByRole('button', { name: /open patient search/i })).toBeInTheDocument();
  });

  it('opens search dialog on button click', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /patient search/i })).toBeInTheDocument();
    });
  });

  it('shows search input when open', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search patient by id/i)).toBeInTheDocument();
    });
  });

  it('fetches and displays patient risk results', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByText('PAT-001')).toBeInTheDocument();
      expect(screen.getByText('PAT-002')).toBeInTheDocument();
    });
  });

  it('shows risk level chip for each patient', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
    });
  });

  it('navigates to encounters when patient is selected', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => screen.getByText('PAT-001'));
    // ListItemButton renders as role="button"
    const buttons = screen.getAllByRole('button');
    const patientBtn = buttons.find(b => b.textContent?.includes('PAT-001'));
    fireEvent.click(patientBtn!);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/encounters?patientId=PAT-001'));
  });

  it('saves selected patient to localStorage', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => screen.getByText('PAT-001'));
    const buttons = screen.getAllByRole('button');
    const patientBtn = buttons.find(b => b.textContent?.includes('PAT-001'));
    fireEvent.click(patientBtn!);
    const recent = loadRecentPatients();
    expect(recent[0]).toBe('PAT-001');
  });

  it('shows recent patients section when localStorage has entries', async () => {
    saveRecentPatient('PAT-PREV');
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByText('RECENT PATIENTS')).toBeInTheDocument();
      expect(screen.getByText('PAT-PREV')).toBeInTheDocument();
    });
  });

  it('shows empty state when no results and no recent patients', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => [] }) as any;
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => {
      expect(screen.getByText(/no patient data available/i)).toBeInTheDocument();
    });
  });

  it('closes dialog when Escape is pressed in input', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /open patient search/i }));
    await waitFor(() => screen.getByPlaceholderText(/search patient by id/i));
    const input = screen.getByPlaceholderText(/search patient by id/i);
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /patient search/i })).not.toBeInTheDocument();
    });
  });
});
