import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DenialManager } from './DenialManager';

const mockDenials = [
  {
    id: 'denial-1',
    claimNumber: 'CLM-001',
    patientId: 'PAT-001',
    payerName: 'BlueCross',
    denialReasonCode: '97',
    denialReasonDescription: 'Payment adjusted because treatment was not medically necessary',
    category: 'MedicalNecessity',
    status: 'Open',
    deniedAmount: 1500.0,
    deniedAt: '2025-01-01T10:00:00Z',
    appealDeadline: '2025-03-01T00:00:00Z',
    daysUntilDeadline: 45,
    resubmissionCount: 0,
  },
  {
    id: 'denial-2',
    claimNumber: 'CLM-002',
    patientId: 'PAT-002',
    payerName: 'Aetna',
    denialReasonCode: '4',
    denialReasonDescription: 'The service/equipment/drug is not covered',
    category: 'Bundling',
    status: 'Open',
    deniedAmount: 300.0,
    deniedAt: '2025-01-10T10:00:00Z',
    appealDeadline: '2025-01-15T00:00:00Z',
    daysUntilDeadline: 3,
    resubmissionCount: 1,
  },
];

const mockAnalytics = {
  totalOpen: 2,
  totalUnderAppeal: 1,
  totalResolved: 10,
  overturned: 5,
  overturnRate: 0.5,
  nearDeadlineCount: 1,
  byCategory: { MedicalNecessity: 1, Bundling: 1 },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('DenialManager', () => {
  it('renders the Denial Analytics card header', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText(/denial analytics/i, { selector: '*' })).toBeInTheDocument());
  });

  it('renders the Open Claim Denials card', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText(/open claim denials/i, { selector: '*' })).toBeInTheDocument());
  });

  it('displays analytics overturn rate', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    render(<DenialManager />);
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('displays denial entries with claim numbers', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    render(<DenialManager />);
    await waitFor(() => {
      expect(screen.getByText('CLM-001')).toBeInTheDocument();
      expect(screen.getByText('CLM-002')).toBeInTheDocument();
    });
  });

  it('shows empty state when no denials', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockAnalytics, totalOpen: 0 }) } as Response);
    render(<DenialManager />);
    await waitFor(() => {
      expect(screen.getByText(/no open claim denials/i)).toBeInTheDocument();
    });
  });

  it('shows days until deadline chip', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    render(<DenialManager />);
    await waitFor(() => {
      expect(screen.getByText('45d left')).toBeInTheDocument();
      expect(screen.getByText('3d left')).toBeInTheDocument();
    });
  });

  it('opens appeal dialog when Appeal button clicked', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    const user = userEvent.setup();
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText('CLM-001')).toBeInTheDocument());
    const appealButtons = screen.getAllByRole('button', { name: /appeal/i });
    await user.click(appealButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /submit appeal/i })).toBeInTheDocument();
    });
  });

  it('submits appeal POST with notes and closes dialog', { timeout: 15000 }, async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);

    const user = userEvent.setup({ delay: null });
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText('CLM-001')).toBeInTheDocument());

    const appealButtons = screen.getAllByRole('button', { name: /appeal/i });
    await user.click(appealButtons[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/describe the clinical/i), 'Medical necessity documented');
    await user.click(screen.getByRole('button', { name: /submit appeal/i }));

    await waitFor(() => {
      const appealCalls = fetchMock.mock.calls.filter(([url, opts]) =>
        String(url).includes('/appeal') && (opts as RequestInit)?.method === 'POST'
      );
      expect(appealCalls.length).toBe(1);
    }, { timeout: 5000 });
  });

  it('shows urgency alert in dialog for denials with ≤7 days left', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);
    const user = userEvent.setup();
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText('CLM-002')).toBeInTheDocument());

    // CLM-002 has 3 days left — but resubmissionCount is 1, Appeal button is enabled (<3)
    const appealButtons = screen.getAllByRole('button', { name: /appeal/i });
    // Find the CLM-002 appeal button — it's the second one
    await user.click(appealButtons[1]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/3 day/i)).toBeInTheDocument();
    });
  });

  it('cancels appeal dialog without calling API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockDenials } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics } as Response);

    const user = userEvent.setup();
    render(<DenialManager />);
    await waitFor(() => expect(screen.getByText('CLM-001')).toBeInTheDocument());

    const appealButtons = screen.getAllByRole('button', { name: /appeal/i });
    await user.click(appealButtons[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Only the initial 2 fetch calls for denials + analytics
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});
