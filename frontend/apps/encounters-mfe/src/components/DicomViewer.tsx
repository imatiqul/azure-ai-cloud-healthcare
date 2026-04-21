import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── DICOM Viewer Component ────────────────────────────────────────────────────
//
// Provides an embedded DICOM imaging viewer for the Encounters MFE.
//
// Integration strategy:
//   The OHIF Viewer (https://ohif.org) is the industry-standard open-source
//   DICOM viewer. We embed it as an iframe pointed at a self-hosted or
//   cloud-hosted OHIF instance, passing the study UID via URL params.
//   WADO-RS requests from OHIF are served by the HealthQ FHIR service
//   at /api/v1/fhir/imaging/{studyId} which proxies to the DICOMweb endpoint.
//
// Fallback (no OHIF configured):
//   Shows a metadata card with study details and a deep-link button to open
//   the study in the EHR's native DICOM viewer.
//
// Security:
//   - Content-Security-Policy allows the configured OHIF origin only
//   - The OHIF iframe communicates via window.postMessage (origin-checked)
//   - WADO-RS requests include the session Bearer token via the FHIR proxy
//   - No DICOM pixel data is stored in browser localStorage

export interface DicomStudy {
  studyInstanceUid: string;
  studyDate: string;
  modality: 'CT' | 'MR' | 'XR' | 'US' | 'PET' | 'NM' | string;
  description: string;
  seriesCount: number;
  instanceCount: number;
  bodyPart?: string;
  accessionNumber?: string;
  referringPhysician?: string;
}

export interface DicomViewerProps {
  /** FHIR ImagingStudy resource ID */
  studyId: string;
  /** Pre-fetched study metadata (optional – viewer fetches if not provided) */
  study?: DicomStudy;
  /** OHIF Viewer base URL. Falls back to VITE_OHIF_VIEWER_URL env var. */
  ohifBaseUrl?: string;
  /** Height of the viewer iframe (default: 600px) */
  height?: number;
  /** Called when the viewer signals a finding annotation was created */
  onFindingAnnotated?: (finding: DicomFinding) => void;
}

export interface DicomFinding {
  studyInstanceUid: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  annotationType: 'length' | 'area' | 'angle' | 'text' | 'arrow';
  description: string;
  annotatedAt: string;
}

type ViewerState = 'loading' | 'ready' | 'error' | 'fallback';

const MODALITY_ICONS: Record<string, string> = {
  CT:  '🔬',
  MR:  '🧲',
  XR:  '📷',
  US:  '🔊',
  PET: '☢️',
  NM:  '⚛️',
};

export const DicomViewer: React.FC<DicomViewerProps> = ({
  studyId,
  study,
  ohifBaseUrl,
  height = 600,
  onFindingAnnotated,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [studyMeta, setStudyMeta] = useState<DicomStudy | null>(study ?? null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Resolve OHIF base URL from props → env var → null (fallback mode)
  const ohifUrl = ohifBaseUrl
    ?? (typeof import.meta !== 'undefined'
        ? (import.meta as unknown as { env?: Record<string, string> })
            .env?.VITE_OHIF_VIEWER_URL
        : undefined);

  // ── Fetch study metadata from FHIR service if not provided ───────────────
  useEffect(() => {
    if (study || studyMeta) return;

    const controller = new AbortController();
    fetch(`/api/v1/fhir/imaging/${encodeURIComponent(studyId)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(res => {
        if (!res.ok) throw new Error(`FHIR imaging fetch failed: ${res.status}`);
        return res.json() as Promise<DicomStudy>;
      })
      .then(meta => setStudyMeta(meta))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setErrorMsg(err.message ?? 'Failed to load study metadata');
          setViewerState('fallback');
        }
      });

    return () => controller.abort();
  }, [studyId, study, studyMeta]);

  // ── Listen for postMessage events from OHIF iframe ────────────────────────
  useEffect(() => {
    if (!ohifUrl || !onFindingAnnotated) return;

    const handleMessage = (event: MessageEvent) => {
      // Strict origin check — only accept messages from our OHIF origin
      try {
        const origin = new URL(ohifUrl).origin;
        if (event.origin !== origin) return;
      } catch {
        return;
      }

      // OHIF emits events in the format: { eventType: 'MEASUREMENT_ADDED', ... }
      const data = event.data as { eventType?: string; payload?: unknown };
      if (data?.eventType === 'MEASUREMENT_ADDED' && data.payload) {
        const payload = data.payload as Record<string, unknown>;
        onFindingAnnotated({
          studyInstanceUid: (payload.studyInstanceUID as string) ?? studyId,
          seriesInstanceUid: payload.seriesInstanceUID as string | undefined,
          sopInstanceUid:    payload.sopInstanceUID    as string | undefined,
          annotationType:    (payload.type as DicomFinding['annotationType']) ?? 'text',
          description:       (payload.description as string) ?? '',
          annotatedAt:       new Date().toISOString(),
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ohifUrl, studyId, onFindingAnnotated]);

  // ── Construct OHIF viewer URL ─────────────────────────────────────────────
  const buildOhifUrl = useCallback((): string => {
    if (!ohifUrl || !studyMeta) return '';
    // OHIF URL pattern: /viewer?StudyInstanceUIDs=<uid>
    const base = ohifUrl.replace(/\/$/, '');
    const uid  = studyMeta.studyInstanceUid;
    // Wado-RS data source configured in OHIF to point to our FHIR proxy
    return `${base}/viewer?StudyInstanceUIDs=${encodeURIComponent(uid)}&hangingprotocolId=default`;
  }, [ohifUrl, studyMeta]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (viewerState === 'fallback' || !ohifUrl) {
    return (
      <DicomFallbackCard
        studyId={studyId}
        study={studyMeta}
        errorMsg={errorMsg}
      />
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#000',
      }}
      aria-label={`DICOM viewer for study ${studyId}`}
    >
      {/* Loading overlay */}
      {viewerState === 'loading' && (
        <div style={overlayStyle}>
          <span style={{ color: '#fff', fontSize: 14 }}>Loading DICOM viewer…</span>
        </div>
      )}

      {/* Error overlay */}
      {viewerState === 'error' && (
        <div style={{ ...overlayStyle, flexDirection: 'column', gap: 8 }}>
          <span style={{ color: '#f44336', fontSize: 14 }}>⚠ Viewer failed to load</span>
          <span style={{ color: '#aaa', fontSize: 12 }}>{errorMsg}</span>
          <button
            onClick={() => setViewerState('loading')}
            style={{ padding: '4px 12px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* OHIF iframe — only rendered when study metadata is available */}
      {studyMeta && (
        <iframe
          ref={iframeRef}
          src={buildOhifUrl()}
          title={`DICOM viewer — ${studyMeta.description}`}
          width="100%"
          height="100%"
          style={{ border: 'none', display: viewerState === 'ready' ? 'block' : 'block' }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          onLoad={() => setViewerState('ready')}
          onError={() => {
            setViewerState('error');
            setErrorMsg('OHIF viewer iframe failed to load');
          }}
          allow="fullscreen"
          referrerPolicy="strict-origin"
        />
      )}
    </div>
  );
};

// ── Fallback card (shown when OHIF is not configured or study fetch fails) ───

interface FallbackProps {
  studyId: string;
  study: DicomStudy | null;
  errorMsg: string;
}

const DicomFallbackCard: React.FC<FallbackProps> = ({ studyId, study, errorMsg }) => (
  <div
    style={{
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      padding: 24,
      background: '#fafafa',
      fontFamily: 'system-ui, sans-serif',
    }}
    aria-label="DICOM study metadata card"
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span style={{ fontSize: 32 }}>
        {MODALITY_ICONS[study?.modality ?? ''] ?? '🩻'}
      </span>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {study?.description ?? 'Imaging Study'}
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
          Study ID: {studyId}
        </p>
      </div>
    </div>

    {study ? (
      <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 16px', fontSize: 13 }}>
        <dt style={{ color: '#666' }}>Date</dt>
        <dd style={{ margin: 0 }}>{study.studyDate}</dd>
        <dt style={{ color: '#666' }}>Modality</dt>
        <dd style={{ margin: 0 }}>{study.modality}</dd>
        <dt style={{ color: '#666' }}>Body Part</dt>
        <dd style={{ margin: 0 }}>{study.bodyPart ?? '—'}</dd>
        <dt style={{ color: '#666' }}>Series</dt>
        <dd style={{ margin: 0 }}>{study.seriesCount}</dd>
        <dt style={{ color: '#666' }}>Instances</dt>
        <dd style={{ margin: 0 }}>{study.instanceCount}</dd>
        {study.accessionNumber && <>
          <dt style={{ color: '#666' }}>Accession</dt>
          <dd style={{ margin: 0 }}>{study.accessionNumber}</dd>
        </>}
        {study.referringPhysician && <>
          <dt style={{ color: '#666' }}>Referring</dt>
          <dd style={{ margin: 0 }}>{study.referringPhysician}</dd>
        </>}
      </dl>
    ) : (
      <p style={{ color: '#999', fontSize: 13 }}>
        {errorMsg || 'Study metadata not available. Configure VITE_OHIF_VIEWER_URL to enable inline viewer.'}
      </p>
    )}

    <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
      <a
        href={`/api/v1/fhir/imaging/${encodeURIComponent(studyId)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 14px',
          background: '#1976d2',
          color: '#fff',
          borderRadius: 4,
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        View in External Viewer ↗
      </a>
      <a
        href={`/api/v1/fhir/imaging/${encodeURIComponent(studyId)}?format=wado`}
        download
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 14px',
          background: '#fff',
          color: '#333',
          border: '1px solid #ccc',
          borderRadius: 4,
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        Download DICOM
      </a>
    </div>
  </div>
);

// ── Shared styles ─────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.7)',
  zIndex: 10,
};

export default DicomViewer;
