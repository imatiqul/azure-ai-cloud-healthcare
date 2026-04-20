import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientRegistrationPanel } from './PatientRegistrationPanel';

describe('PatientRegistrationPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders heading', () => {
    render(<PatientRegistrationPanel />);
    expect(screen.getByText('Patient Registration')).toBeInTheDocument();
  });

  it('Register button is disabled when fields are empty', () => {
    render(<PatientRegistrationPanel />);
    expect(screen.getByRole('button', { name: /register/i })).toBeDisabled();
  });

  it('enables Register button when all fields filled', async () => {
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    expect(screen.getByRole('button', { name: /register/i })).not.toBeDisabled();
  });

  it('POSTs with correct payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'acc-001', email: 'j@x.com', role: 'Patient', fhirPatientId: 'fhir-1' }),
    });
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'j@x.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/patients/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ externalId: 'ext-001', email: 'j@x.com', fullName: 'John Smith' }),
        }),
      ),
    );
  });

  it('shows patient ID and FHIR ID on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'acc-001', email: 'j@x.com', role: 'Patient', fhirPatientId: 'fhir-001' }),
    });
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'j@x.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    await waitFor(() => expect(screen.getByText(/acc-001/)).toBeInTheDocument());
    expect(screen.getByText(/FHIR ID: fhir-001/i)).toBeInTheDocument();
  });

  it('shows Already Registered badge when alreadyRegistered is true', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'acc-001',
          email: 'j@x.com',
          role: 'Patient',
          fhirPatientId: 'fhir-001',
          alreadyRegistered: true,
        }),
    });
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'j@x.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    await waitFor(() => expect(screen.getByText(/already registered/i)).toBeInTheDocument());
  });

  it('shows error alert on HTTP failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Email is required' }),
    });
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'j@x.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    await waitFor(() => expect(screen.getByText(/email is required/i)).toBeInTheDocument());
  });

  it('Reset button clears the form', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'acc-001', email: 'j@x.com', role: 'Patient', fhirPatientId: null }),
    });
    render(<PatientRegistrationPanel />);
    await userEvent.type(screen.getByLabelText(/external id/i), 'ext-001');
    await userEvent.type(screen.getByLabelText(/email/i), 'j@x.com');
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Smith');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    await waitFor(() => screen.getByRole('button', { name: /reset/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.queryByText(/acc-001/)).not.toBeInTheDocument();
  });
});
