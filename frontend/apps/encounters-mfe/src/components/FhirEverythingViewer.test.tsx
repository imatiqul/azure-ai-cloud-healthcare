import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FhirEverythingViewer } from './FhirEverythingViewer';

const mockBundle = {
  resourceType: 'Bundle',
  entry: [
    { resource: { resourceType: 'Encounter', id: 'enc-001', status: 'finished', date: '2026-01-10' } },
    { resource: { resourceType: 'Encounter', id: 'enc-002', status: 'finished', date: '2026-02-05' } },
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-001',
        status: 'final',
        effectiveDateTime: '2026-01-12',
        code: { text: 'Glucose', coding: [{ display: 'Glucose', code: '2345-7' }] },
      },
    },
  ],
};

describe('FhirEverythingViewer', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders the heading', () => {
    render(<FhirEverythingViewer />);
    expect(screen.getByText(/FHIR Patient Record/i)).toBeInTheDocument();
  });

  it('shows prompt text before search', () => {
    render(<FhirEverythingViewer />);
    expect(screen.getByText(/enter a patient id/i)).toBeInTheDocument();
  });

  it('Load Full Record button is disabled with no patient ID', () => {
    render(<FhirEverythingViewer />);
    expect(screen.getByRole('button', { name: /load full record/i })).toBeDisabled();
  });

  it('fetches with correct URL including patient ID', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockBundle),
    });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/fhir/patients/PAT-999/$everything'),
      ),
    );
  });

  it('appends _type query param when resource type filter is selected', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockBundle),
    });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    // Open the Resource Type combobox and pick Observation
    fireEvent.mouseDown(screen.getByLabelText(/resource type/i));
    const option = await screen.findByRole('option', { name: 'Observation' });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('_type=Observation'),
      ),
    );
  });

  it('shows total resource count chip', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockBundle),
    });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() => expect(screen.getByText('3 resources')).toBeInTheDocument());
  });

  it('groups resources by type showing Encounter and Observation sections', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockBundle),
    });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() => expect(screen.getByText('Encounter')).toBeInTheDocument());
    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText('enc-001')).toBeInTheDocument();
    expect(screen.getByText('obs-001')).toBeInTheDocument();
  });

  it('shows empty state alert for bundle with no entries', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] }),
    });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() => expect(screen.getByText(/no fhir resources found/i)).toBeInTheDocument());
  });

  it('shows error alert on HTTP failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });
    render(<FhirEverythingViewer />);
    await userEvent.type(screen.getByLabelText(/patient id/i), 'PAT-999');
    fireEvent.click(screen.getByRole('button', { name: /load full record/i }));
    await waitFor(() => expect(screen.getByText(/FHIR \$everything failed/i)).toBeInTheDocument());
  });
});
