import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatientProfilePanel } from './PatientProfilePanel';

const mockProfile = {
  id: 'acc-123',
  externalId: 'ext-abc',
  email: 'patient@example.com',
  displayName: 'Jane Doe',
  isActive: true,
  fhirPatientId: 'fhir-patient-99',
};

describe('PatientProfilePanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders the heading', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    expect(screen.getByText('My Patient Profile')).toBeInTheDocument();
  });

  it('fetches profile on mount', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identity/patients/me'),
        expect.any(Object),
      ),
    );
  });

  it('displays email and display name', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('patient@example.com')).toBeInTheDocument();
  });

  it('shows Active badge when isActive is true', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument());
  });

  it('shows FHIR ID chip when fhirPatientId is present', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    await waitFor(() => expect(screen.getByText(/FHIR ID: fhir-patient-99/i)).toBeInTheDocument());
  });

  it('shows "FHIR ID Not Linked" chip when fhirPatientId is null', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ...mockProfile, fhirPatientId: null }),
    });
    render(<PatientProfilePanel />);
    await waitFor(() => expect(screen.getByText('FHIR ID Not Linked')).toBeInTheDocument());
  });

  it('shows 404 registration hint error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });
    render(<PatientProfilePanel />);
    await waitFor(() =>
      expect(screen.getByText(/complete registration/i)).toBeInTheDocument(),
    );
  });

  it('refresh button re-fetches profile', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockProfile),
    });
    render(<PatientProfilePanel />);
    await waitFor(() => screen.getByLabelText('refresh'));
    fireEvent.click(screen.getByLabelText('refresh'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
