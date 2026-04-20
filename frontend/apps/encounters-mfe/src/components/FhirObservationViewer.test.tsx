import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FhirObservationViewer } from './FhirObservationViewer';

const mockBundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-1',
        status: 'final',
        code: { text: 'Glucose', coding: [{ code: '2345-7', display: 'Glucose' }] },
        valueQuantity: { value: 95, unit: 'mg/dL' },
        effectiveDateTime: '2026-04-01T08:00:00Z',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-2',
        status: 'preliminary',
        code: { coding: [{ display: 'HbA1c' }] },
        valueQuantity: { value: 6.8, unit: '%' },
        effectiveDateTime: '2026-03-15T09:30:00Z',
      },
    },
  ],
};

describe('FhirObservationViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the FHIR Observation Viewer header', () => {
    render(<FhirObservationViewer />);
    expect(screen.getByText('FHIR Observation Viewer')).toBeDefined();
  });

  it('shows prompt text when nothing has been searched yet', () => {
    render(<FhirObservationViewer />);
    expect(screen.getByText(/enter a patient id/i)).toBeDefined();
  });

  it('disables Search button when Patient ID is empty', () => {
    render(<FhirObservationViewer />);
    expect(screen.getByRole('button', { name: /search observations/i })).toBeDisabled();
  });

  it('fetches correct URL with patientId', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBundle),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-100');
    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/api/v1/fhir/observations/P-100');
  });

  it('appends category query param when category is selected', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] }),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-100');

    // open the Select and pick Laboratory
    const selectEl = screen.getByRole('combobox');
    await user.click(selectEl);
    const labOption = screen.getByRole('option', { name: 'Laboratory' });
    await user.click(labOption);

    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('category=laboratory');
  });

  it('parses FHIR Bundle entries and shows observation table', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBundle),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-100');
    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(screen.getByText('Glucose')).toBeDefined());
    expect(screen.getByText('95 mg/dL')).toBeDefined();
    expect(screen.getByText('HbA1c')).toBeDefined();
    expect(screen.getByText('6.8 %')).toBeDefined();
  });

  it('shows observation count chip', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBundle),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-100');
    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(screen.getByText('2 observation(s)')).toBeDefined());
  });

  it('shows empty state when bundle has no entries', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] }),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-100');
    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(screen.getByText(/no observations found/i)).toBeDefined());
  });

  it('shows error alert on HTTP failure', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });

    render(<FhirObservationViewer />);
    await user.type(screen.getByLabelText(/patient id/i), 'P-999');
    await user.click(screen.getByRole('button', { name: /search observations/i }));

    await waitFor(() => expect(screen.getByText(/http 404/i)).toBeDefined());
  });
});
