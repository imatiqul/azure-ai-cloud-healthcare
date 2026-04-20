import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtpVerificationPanel } from './OtpVerificationPanel';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('OtpVerificationPanel', () => {
  it('renders heading', () => {
    render(<OtpVerificationPanel />);
    expect(screen.getByText('OTP Phone Verification')).toBeInTheDocument();
  });

  it('renders phone number field and send button', () => {
    render(<OtpVerificationPanel />);
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send verification code/i })).toBeInTheDocument();
  });

  it('send button is disabled with empty phone number', () => {
    render(<OtpVerificationPanel />);
    expect(screen.getByRole('button', { name: /send verification code/i })).toBeDisabled();
  });

  it('POST /otp/send with phone number payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
    });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/otp/send'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('+12125551234'),
        }),
      );
    });
  });

  it('shows code sent info alert and code input after successful send', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
    });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(screen.getByText(/code was sent to/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });

  it('POST /otp/verify with otpId and code', async () => {
    // Step 1: send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
    });
    // Step 2: verify
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ verified: true, phoneNumber: '+12125551234' }),
    });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/otp/verify'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('otp-uuid-123'),
        }),
      );
    });
  });

  it('shows verified success state with phone chip', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ verified: true, phoneNumber: '+12125551234' }),
      });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    await userEvent.type(screen.getByLabelText(/verification code/i), '654321');
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() => {
      expect(screen.getByText(/Phone number verified successfully/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Phone: \+12125551234/)).toBeInTheDocument();
  });

  it('shows error alert on 422 invalid code', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid or expired code' }),
      });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => screen.getByLabelText(/verification code/i));
    await userEvent.type(screen.getByLabelText(/verification code/i), '000000');
    fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired code')).toBeInTheDocument();
    });
  });

  it('Start Over resets back to send step', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ otpId: 'otp-uuid-123', expiresAt: '2026-04-20T12:10:00Z' }),
    });

    render(<OtpVerificationPanel />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '+12125551234');
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => screen.getByRole('button', { name: /start over/i }));
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByRole('button', { name: /send verification code/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument();
  });
});
