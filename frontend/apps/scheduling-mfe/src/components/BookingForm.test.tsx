import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setActiveWorkflow, upsertWorkflowHandoff } from '@healthcare/mfe-events';
import { BookingForm } from './BookingForm';

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('BookingForm', () => {
  it('renders the booking card header', () => {
    render(<BookingForm />);
    expect(screen.getByText('Book Appointment', { selector: 'h3,h4,span' })).toBeInTheDocument();
  });

  it('renders all input fields', () => {
    render(<BookingForm />);
    expect(screen.getByPlaceholderText('Select a slot')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Patient ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Practitioner ID')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<BookingForm />);
    expect(screen.getByRole('button', { name: 'Book Appointment' })).toBeInTheDocument();
  });

  it('prefills booking inputs from the persisted workflow handoff', () => {
    upsertWorkflowHandoff({
      workflowId: 'wf-book-1',
      sessionId: 'sess-book-1',
      patientId: 'PAT-222',
      triageLevel: 'P2_Urgent',
      practitionerId: 'DR-009',
      slotId: 'slot-222',
      status: 'Scheduling',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    upsertWorkflowHandoff({
      workflowId: 'wf-book-2',
      sessionId: 'sess-book-2',
      patientId: 'PAT-333',
      triageLevel: 'P3_Standard',
      practitionerId: 'DR-111',
      slotId: 'slot-333',
      status: 'Scheduling',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    setActiveWorkflow('wf-book-1');

    render(<BookingForm />);

    expect(screen.getByDisplayValue('slot-222')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PAT-222')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DR-009')).toBeInTheDocument();
  });
});
