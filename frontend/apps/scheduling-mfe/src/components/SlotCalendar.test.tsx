import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setActiveWorkflow, upsertWorkflowHandoff } from '@healthcare/mfe-events';
import { SlotCalendar } from './SlotCalendar';

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('SlotCalendar', () => {
  it('shows empty state when no slots', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as unknown as typeof fetch;

    render(<SlotCalendar />);
    await waitFor(() => {
      expect(screen.getByText('No available slots for this date')).toBeInTheDocument();
    });
  });

  it('renders slot cards after fetch', async () => {
    const slots = [
      { id: '1', practitionerId: 'DR-001', startTime: '2025-01-01T08:00:00Z', endTime: '2025-01-01T08:30:00Z', status: 'Available' },
      { id: '2', practitionerId: 'DR-001', startTime: '2025-01-01T09:00:00Z', endTime: '2025-01-01T09:30:00Z', status: 'Available' },
    ];
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(slots) })
    ) as unknown as typeof fetch;

    render(<SlotCalendar />);
    await waitFor(() => {
      expect(screen.getAllByText('Available')).toHaveLength(2);
    });
  });

  it('renders the Available Slots header', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    render(<SlotCalendar />);
    expect(screen.getByText('Available Slots')).toBeInTheDocument();
  });

  it('handles fetch error gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('fail'))) as unknown as typeof fetch;
    render(<SlotCalendar />);
    await waitFor(() => {
      expect(screen.getByText('No available slots for this date')).toBeInTheDocument();
    });
  });

  it('reserves a slot with patient and practitioner context from the active workflow', async () => {
    upsertWorkflowHandoff({
      workflowId: 'wf-slot-1',
      sessionId: 'sess-slot-1',
      patientId: 'PAT-111',
      triageLevel: 'P2_Urgent',
      status: 'Completed',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    upsertWorkflowHandoff({
      workflowId: 'wf-slot-2',
      sessionId: 'sess-slot-2',
      patientId: 'PAT-222',
      triageLevel: 'P3_Standard',
      status: 'Completed',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    setActiveWorkflow('wf-slot-1');
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const user = userEvent.setup({ delay: null });
    const reservedEvents: Array<{ slotId: string; patientId?: string; practitionerId?: string }> = [];
    const listener = (event: Event) => {
      reservedEvents.push((event as CustomEvent<{ slotId: string; patientId?: string; practitionerId?: string }>).detail);
    };
    window.addEventListener('mfe:slot:reserved', listener);

    render(<SlotCalendar />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reserve slot demo-slot-0/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reserve slot demo-slot-0/i }));

    await waitFor(() => {
      expect(reservedEvents).toContainEqual({
        slotId: 'demo-slot-0',
        patientId: 'PAT-111',
        practitionerId: 'DR-1',
      });
      expect(sessionStorage.getItem('hq:tab-scheduling')).toBe('1');
    });

    window.removeEventListener('mfe:slot:reserved', listener);
  });
});
