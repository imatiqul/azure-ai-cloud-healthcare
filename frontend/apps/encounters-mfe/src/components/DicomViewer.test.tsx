import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { DicomViewer } from './DicomViewer';
import type { DicomStudy } from './DicomViewer';

expect.extend(toHaveNoViolations);

const mockStudy: DicomStudy = {
  studyInstanceUid: '1.2.840.10008.5.1.4.1.1.2',
  studyDate: '2026-04-15',
  modality: 'CT',
  description: 'CT Chest with Contrast',
  seriesCount: 3,
  instanceCount: 120,
  bodyPart: 'CHEST',
  accessionNumber: 'ACC-20260415-001',
  referringPhysician: 'Dr. Emily Chen',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DicomViewer', () => {
  describe('Fallback card (no OHIF URL configured)', () => {
    it('renders fallback card when ohifBaseUrl is not provided', () => {
      render(<DicomViewer studyId="study-123" study={mockStudy} />);

      expect(screen.getByRole('term', { hidden: true }) || screen.getByText('CT')).toBeTruthy();
      expect(screen.getByText('CT Chest with Contrast')).toBeInTheDocument();
      expect(screen.getByText(/study-123/i)).toBeInTheDocument();
    });

    it('shows study metadata fields in fallback card', () => {
      render(<DicomViewer studyId="study-123" study={mockStudy} />);

      expect(screen.getByText('CHEST')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();     // instanceCount
      expect(screen.getByText('3')).toBeInTheDocument();       // seriesCount
      expect(screen.getByText('ACC-20260415-001')).toBeInTheDocument();
      expect(screen.getByText('Dr. Emily Chen')).toBeInTheDocument();
    });

    it('provides accessible external viewer link', () => {
      render(<DicomViewer studyId="study-123" study={mockStudy} />);

      const link = screen.getByRole('link', { name: /external viewer/i });
      expect(link).toHaveAttribute('href', '/api/v1/fhir/imaging/study-123');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('provides DICOM download link', () => {
      render(<DicomViewer studyId="study-123" study={mockStudy} />);

      const link = screen.getByRole('link', { name: /download dicom/i });
      expect(link).toHaveAttribute('download');
    });

    it('shows placeholder message when no study metadata and no OHIF URL', () => {
      render(<DicomViewer studyId="study-456" />);

      // Without study prop, a fetch is attempted; fallback renders while loading
      // The component shows a metadata-unavailable message in no-OHIF mode
      expect(screen.getByLabelText(/dicom study metadata card/i)).toBeInTheDocument();
    });

    it('has no accessibility violations in fallback mode', async () => {
      const { container } = render(<DicomViewer studyId="study-123" study={mockStudy} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('OHIF iframe mode', () => {
    const ohifBase = 'https://viewer.example.com';

    it('renders iframe with OHIF viewer URL when ohifBaseUrl is provided', () => {
      render(
        <DicomViewer
          studyId="study-789"
          study={mockStudy}
          ohifBaseUrl={ohifBase}
        />
      );

      const iframe = screen.getByTitle(/DICOM viewer/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('src')).toContain(ohifBase);
      expect(iframe.getAttribute('src')).toContain(
        encodeURIComponent(mockStudy.studyInstanceUid)
      );
    });

    it('iframe has correct sandbox restrictions', () => {
      render(
        <DicomViewer studyId="study-789" study={mockStudy} ohifBaseUrl={ohifBase} />
      );

      const iframe = screen.getByTitle(/DICOM viewer/i);
      expect(iframe.getAttribute('sandbox')).toBe(
        'allow-same-origin allow-scripts allow-forms allow-popups'
      );
    });

    it('iframe has strict referrer policy', () => {
      render(
        <DicomViewer studyId="study-789" study={mockStudy} ohifBaseUrl={ohifBase} />
      );

      const iframe = screen.getByTitle(/DICOM viewer/i);
      expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin');
    });

    it('respects custom height prop', () => {
      render(
        <DicomViewer studyId="study-789" study={mockStudy} ohifBaseUrl={ohifBase} height={800} />
      );

      const wrapper = screen.getByLabelText(/dicom viewer for study/i);
      expect(wrapper).toHaveStyle({ height: '800px' });
    });

    it('calls onFindingAnnotated when OHIF posts a MEASUREMENT_ADDED message', async () => {
      const onFinding = vi.fn();

      render(
        <DicomViewer
          studyId="study-789"
          study={mockStudy}
          ohifBaseUrl={ohifBase}
          onFindingAnnotated={onFinding}
        />
      );

      // Simulate OHIF postMessage event from the allowed origin
      const event = new MessageEvent('message', {
        origin: new URL(ohifBase).origin,
        data: {
          eventType: 'MEASUREMENT_ADDED',
          payload: {
            studyInstanceUID: mockStudy.studyInstanceUid,
            seriesInstanceUID: '1.2.3',
            sopInstanceUID:    '1.2.3.4',
            type:              'length',
            description:       'Nodule diameter 8mm',
          },
        },
      });

      window.dispatchEvent(event);

      await waitFor(() => {
        expect(onFinding).toHaveBeenCalledOnce();
        const [finding] = onFinding.mock.calls[0];
        expect(finding.studyInstanceUid).toBe(mockStudy.studyInstanceUid);
        expect(finding.annotationType).toBe('length');
        expect(finding.description).toBe('Nodule diameter 8mm');
      });
    });

    it('ignores postMessage events from unknown origins', async () => {
      const onFinding = vi.fn();

      render(
        <DicomViewer
          studyId="study-789"
          study={mockStudy}
          ohifBaseUrl={ohifBase}
          onFindingAnnotated={onFinding}
        />
      );

      const maliciousEvent = new MessageEvent('message', {
        origin: 'https://evil.example.com',
        data: {
          eventType: 'MEASUREMENT_ADDED',
          payload:   { studyInstanceUID: 'injected' },
        },
      });

      window.dispatchEvent(maliciousEvent);

      // Wait briefly; onFinding must NOT have been called
      await new Promise(r => setTimeout(r, 50));
      expect(onFinding).not.toHaveBeenCalled();
    });
  });

  describe('Fetch behaviour (no study prop)', () => {
    it('fetches study metadata from FHIR API when study prop is omitted', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockStudy,
      } as Response);

      render(<DicomViewer studyId="study-fetch-123" />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/v1/fhir/imaging/study-fetch-123',
          expect.objectContaining({ headers: { Accept: 'application/json' } })
        );
      });
    });

    it('shows fallback card when FHIR fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      render(<DicomViewer studyId="study-fail" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/dicom study metadata card/i)).toBeInTheDocument();
      });
    });
  });
});
