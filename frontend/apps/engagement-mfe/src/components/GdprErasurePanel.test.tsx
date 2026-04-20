import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GdprErasurePanel } from './GdprErasurePanel';

const mockResponse = {
  message: 'Erasure request accepted. PHI deletion will complete asynchronously.',
  patientUserId: 'patient-42',
  revokedConsents: 3,
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('GdprErasurePanel', () => {
  it('renders the heading and GDPR warning', () => {
    render(<GdprErasurePanel />);
    expect(screen.getByText('GDPR Right to Erasure')).toBeInTheDocument();
    expect(screen.getByText(/Art. 17 — Right to Be Forgotten/)).toBeInTheDocument();
  });

  it('Request Erasure button is disabled without valid input', () => {
    render(<GdprErasurePanel />);
    expect(screen.getByRole('button', { name: 'Request Erasure' })).toBeDisabled();
  });

  it('Request Erasure button is disabled if reason is too short', async () => {
    const user = userEvent.setup();
    render(<GdprErasurePanel />);
    await user.type(screen.getByLabelText('patient user id'), 'patient-42');
    await user.type(screen.getByLabelText('Reason for Erasure'), 'short');
    expect(screen.getByRole('button', { name: 'Request Erasure' })).toBeDisabled();
  });

  it('opens confirmation dialog on Request Erasure click', async () => {
    const user = userEvent.setup();
    render(<GdprErasurePanel />);
    await user.type(screen.getByLabelText('patient user id'), 'patient-42');
    await user.type(
      screen.getByLabelText('Reason for Erasure'),
      'Patient requested deletion of all data under GDPR',
    );
    await user.click(screen.getByRole('button', { name: 'Request Erasure' }));
    expect(screen.getByText('Confirm Erasure Request')).toBeInTheDocument();
  });

  it('POSTs to /identity/consent/erasure on confirm', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    render(<GdprErasurePanel />);
    await user.type(screen.getByLabelText('patient user id'), 'patient-42');
    await user.type(
      screen.getByLabelText('Reason for Erasure'),
      'Patient requested deletion of all data under GDPR',
    );
    await user.click(screen.getByRole('button', { name: 'Request Erasure' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Erasure' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/consent/erasure'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows success alert with revokedConsents chip after erasure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    render(<GdprErasurePanel />);
    await user.type(screen.getByLabelText('patient user id'), 'patient-42');
    await user.type(
      screen.getByLabelText('Reason for Erasure'),
      'Patient requested deletion of all data under GDPR',
    );
    await user.click(screen.getByRole('button', { name: 'Request Erasure' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Erasure' }));

    await waitFor(() => {
      expect(screen.getByText(/Erasure request accepted/)).toBeInTheDocument();
      expect(screen.getByText('Consents revoked: 3')).toBeInTheDocument();
    });
  });

  it('shows error alert on failed erasure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    render(<GdprErasurePanel />);
    await user.type(screen.getByLabelText('patient user id'), 'missing-patient');
    await user.type(
      screen.getByLabelText('Reason for Erasure'),
      'Patient requested deletion of all data under GDPR',
    );
    await user.click(screen.getByRole('button', { name: 'Request Erasure' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Erasure' }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
    });
  });
});
