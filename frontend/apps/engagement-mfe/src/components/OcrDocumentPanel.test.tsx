import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OcrDocumentPanel } from './OcrDocumentPanel';

describe('OcrDocumentPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders Submit OCR Job and OCR Job History headings', () => {
    render(<OcrDocumentPanel />);
    expect(screen.getByText('Submit OCR Job')).toBeInTheDocument();
    expect(screen.getByText('OCR Job History')).toBeInTheDocument();
  });

  it('Create Job button is disabled when fields are empty', () => {
    render(<OcrDocumentPanel />);
    expect(screen.getByRole('button', { name: /create job/i })).toBeDisabled();
  });

  it('POSTs to /api/v1/ocr/jobs with correct payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-001', status: 'Queued' }),
    });
    render(<OcrDocumentPanel />);
    await userEvent.type(screen.getByLabelText(/patient id \(guid\)/i), 'pat-uuid-001');
    await userEvent.type(screen.getByLabelText(/document url/i), 'https://blob.example.com/doc.pdf');
    fireEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ocr/jobs'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('pat-uuid-001'),
        }),
      ),
    );
  });

  it('shows job ID and Queued badge after creation', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-001', status: 'Queued' }),
    });
    render(<OcrDocumentPanel />);
    await userEvent.type(screen.getByLabelText(/patient id \(guid\)/i), 'pat-uuid-001');
    await userEvent.type(screen.getByLabelText(/document url/i), 'https://blob.example.com/doc.pdf');
    fireEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => expect(screen.getByText('Queued')).toBeInTheDocument());
    expect(screen.getByText(/job-001/)).toBeInTheDocument();
  });

  it('POSTs to /api/v1/ocr/jobs/{id}/process on Process click', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'job-001', status: 'Queued' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'job-001', status: 'Completed', extractedText: 'Test text' }),
      });
    render(<OcrDocumentPanel />);
    await userEvent.type(screen.getByLabelText(/patient id \(guid\)/i), 'pat-uuid-001');
    await userEvent.type(screen.getByLabelText(/document url/i), 'https://blob.example.com/doc.pdf');
    fireEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => screen.getByRole('button', { name: /^process$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^process$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ocr/jobs/job-001/process'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows extracted text after processing completes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'job-001', status: 'Queued' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'job-001', status: 'Completed', extractedText: 'Patient: Jane Doe' }),
      });
    render(<OcrDocumentPanel />);
    await userEvent.type(screen.getByLabelText(/patient id \(guid\)/i), 'pat-uuid-001');
    await userEvent.type(screen.getByLabelText(/document url/i), 'https://blob.example.com/doc.pdf');
    fireEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => screen.getByRole('button', { name: /^process$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^process$/i }));
    await waitFor(() => expect(screen.getByText('Patient: Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('GETs /api/v1/ocr/jobs?patientId= on Load History', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'job-001', patientId: 'pat-1', status: 'Completed', createdAt: '2026-04-01T10:00:00Z' },
        ]),
    });
    render(<OcrDocumentPanel />);
    const historyInput = screen.getAllByLabelText(/patient id/i)[1];
    await userEvent.type(historyInput, 'pat-1');
    fireEvent.click(screen.getByRole('button', { name: /load history/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ocr/jobs?patientId=pat-1'),
      ),
    );
  });

  it('shows job history entries with count chip', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'job-abc-1234', patientId: 'pat-1', status: 'Completed', createdAt: '2026-04-01T10:00:00Z' },
          { id: 'job-xyz-5678', patientId: 'pat-1', status: 'Failed', createdAt: '2026-04-02T10:00:00Z' },
        ]),
    });
    render(<OcrDocumentPanel />);
    const historyInput = screen.getAllByLabelText(/patient id/i)[1];
    await userEvent.type(historyInput, 'pat-1');
    fireEvent.click(screen.getByRole('button', { name: /load history/i }));
    await waitFor(() => expect(screen.getByText(/2 jobs/i)).toBeInTheDocument());
    expect(screen.getByText(/job-abc/i)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows error alert on history fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    render(<OcrDocumentPanel />);
    const historyInput = screen.getAllByLabelText(/patient id/i)[1];
    await userEvent.type(historyInput, 'pat-1');
    fireEvent.click(screen.getByRole('button', { name: /load history/i }));
    await waitFor(() => expect(screen.getByText(/failed to load history/i)).toBeInTheDocument());
  });
});
