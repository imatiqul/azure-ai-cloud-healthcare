import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HitlEscalationModal } from './HitlEscalationModal';

beforeEach(() => {
  vi.restoreAllMocks();
});

const defaultProps = {
  workflowId: 'wf-test-001',
  triageLevel: 'P1_Immediate',
  agentReasoning: 'Chest pain with ST elevation — immediate cardiology review required.',
  onApprove: vi.fn(),
  onClose: vi.fn(),
};

describe('HitlEscalationModal', () => {
  it('renders Human Review Required title', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<HitlEscalationModal {...defaultProps} />);
    expect(screen.getByText('Human Review Required')).toBeInTheDocument();
  });

  it('displays workflow ID in the modal', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<HitlEscalationModal {...defaultProps} />);
    expect(screen.getByText('wf-test-001')).toBeInTheDocument();
  });

  it('shows triage level passed as prop', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<HitlEscalationModal {...defaultProps} />);
    expect(screen.getByText('P1_Immediate')).toBeInTheDocument();
  });

  it('shows agent reasoning text', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<HitlEscalationModal {...defaultProps} />);
    expect(screen.getByText(/Chest pain with ST elevation/)).toBeInTheDocument();
  });

  it('requires a note before approving — approve button disabled without note', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<HitlEscalationModal {...defaultProps} />);

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    expect(approveBtn).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls approve endpoint and onApprove callback when note provided', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<HitlEscalationModal {...defaultProps} onApprove={onApprove} />);

    const noteField = screen.getByLabelText(/Clinical Justification Note/i);
    await user.type(noteField, 'Reviewed by cardiologist on call — approve escalation');

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    await user.click(approveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/approve'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onApprove).toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<HitlEscalationModal {...defaultProps} onClose={onClose} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
