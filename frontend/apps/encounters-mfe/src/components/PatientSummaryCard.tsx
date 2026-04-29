import { useEffect, useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PersonIcon from '@mui/icons-material/Person';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MedicationIcon from '@mui/icons-material/Medication';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventIcon from '@mui/icons-material/Event';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientSummary {
  id:                 string;
  fullName:           string;
  dateOfBirth:        string;
  gender:             string;
  conditions:         string[];
  readmissionRisk:    number;        // 0–100
  riskLevel:          'High' | 'Moderate' | 'Low';
  lastEncounterDate:  string;        // ISO
  activeMedCount:     number;
  allergiesCount:     number;
}

// ── Demo data for the three standard demo patients ────────────────────────────

const DEMO_SUMMARIES: Record<string, PatientSummary> = {
  'PAT-00142': {
    id:                'PAT-00142',
    fullName:          'Alice Morgan',
    dateOfBirth:       '1967-08-14',
    gender:            'Female',
    conditions:        ['Type 2 Diabetes Mellitus', 'Hypertension', 'Chronic Kidney Disease (Stage 2)'],
    readmissionRisk:   72,
    riskLevel:         'High',
    lastEncounterDate: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    activeMedCount:    4,
    allergiesCount:    2,
  },
  'PAT-00278': {
    id:                'PAT-00278',
    fullName:          'James Chen',
    dateOfBirth:       '1961-03-22',
    gender:            'Male',
    conditions:        ['Coronary Artery Disease', 'Atrial Fibrillation', 'Dyslipidemia'],
    readmissionRisk:   81,
    riskLevel:         'High',
    lastEncounterDate: new Date(Date.now() - 18 * 86_400_000).toISOString(),
    activeMedCount:    6,
    allergiesCount:    1,
  },
  'PAT-00315': {
    id:                'PAT-00315',
    fullName:          "Sarah O'Brien",
    dateOfBirth:       '1978-11-05',
    gender:            'Female',
    conditions:        ["Stage III Breast Cancer", "Chemotherapy-induced Nausea", "Fatigue"],
    readmissionRisk:   68,
    riskLevel:         'Moderate',
    lastEncounterDate: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    activeMedCount:    8,
    allergiesCount:    3,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskChipColor(level: PatientSummary['riskLevel']): 'error' | 'warning' | 'success' {
  if (level === 'High')     return 'error';
  if (level === 'Moderate') return 'warning';
  return 'success';
}

function riskBarHex(level: PatientSummary['riskLevel']): string {
  if (level === 'High')     return '#ef4444';
  if (level === 'Moderate') return '#f97316';
  return '#22c55e';
}

function formatAge(dob: string): number {
  const birth   = new Date(dob);
  const diffMs  = Date.now() - birth.getTime();
  return Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
}

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  const hours  = Math.floor(diffMs / 3_600_000);
  const days   = Math.floor(diffMs / 86_400_000);
  if (mins  <  60) return `${mins}m ago`;
  if (hours <  24) return `${hours}h ago`;
  if (days  ===  1) return 'Yesterday';
  if (days  <  30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PatientSummaryCard({ patientId }: { patientId: string }) {
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlightRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!patientId) { setSummary(null); return; }

    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    setLoading(true);
    setSummary(null);

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/fhir/patients/${encodeURIComponent(patientId)}/summary`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PatientSummary = await res.json();
        if (!controller.signal.aborted) setSummary(data);
      } catch {
        // Backend offline — use demo patient data
        if (!controller.signal.aborted) setSummary(DEMO_SUMMARIES[patientId] ?? null);
      } finally {
        clearTimeout(timer);
        if (inFlightRequest.current === controller) { inFlightRequest.current = null; setLoading(false); }
      }
    })();

    return () => { inFlightRequest.current?.abort(); };
  }, [patientId]);

  if (!patientId) return null;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box
        sx={{
          p: 2,
          mb: 2.5,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Skeleton variant="text"    width={220} height={30} />
        <Skeleton variant="text"    width={160} height={20} sx={{ mt: 0.5 }} />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Skeleton variant="rounded" width={130} height={24} />
          <Skeleton variant="rounded" width={150} height={24} />
        </Stack>
      </Box>
    );
  }

  if (!summary) return null;

  return (
    <Box
      sx={{
        p: 2,
        mb: 2.5,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(30,41,59,0.8)'
            : 'rgba(248,250,252,0.95)',
      }}
      aria-label={`Patient summary for ${summary.fullName}`}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2.5}
        alignItems={{ md: 'flex-start' }}
      >
        {/* ── Left: Identity + conditions ─────────────────────────────── */}
        <Box sx={{ flex: 1 }}>
          {/* Name + ID */}
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5} flexWrap="wrap">
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              {summary.fullName}
            </Typography>
            <Chip
              label={summary.id}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace', fontSize: '0.68rem', height: 20 }}
            />
          </Stack>

          {/* Demographics */}
          <Typography variant="body2" color="text.secondary" mb={1.25}>
            {summary.gender} &middot; {formatAge(summary.dateOfBirth)}&thinsp;yrs &middot; DOB {summary.dateOfBirth}
          </Typography>

          {/* Active conditions */}
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {summary.conditions.map((c) => (
              <Chip
                key={c}
                label={c}
                size="small"
                icon={<MedicalInformationIcon sx={{ fontSize: '14px !important' }} />}
                variant="outlined"
                sx={{ fontSize: '0.7rem', height: 24 }}
              />
            ))}
          </Stack>
        </Box>

        {/* ── Right: Risk + stats ──────────────────────────────────────── */}
        <Stack spacing={1.5} sx={{ minWidth: 210 }}>
          {/* Readmission risk bar */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.4}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <MonitorHeartIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">Readmission Risk</Typography>
              </Stack>
              <Chip
                label={`${summary.riskLevel} · ${summary.readmissionRisk}%`}
                size="small"
                color={riskChipColor(summary.riskLevel)}
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
              />
            </Stack>
            <LinearProgress
              variant="determinate"
              value={summary.readmissionRisk}
              sx={{
                height: 7,
                borderRadius: 4,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  bgcolor: riskBarHex(summary.riskLevel),
                  borderRadius: 4,
                },
              }}
            />
          </Box>

          {/* Quick stats row */}
          <Stack direction="row" spacing={2} divider={
            <Box sx={{ width: 1, bgcolor: 'divider', alignSelf: 'stretch' }} />
          }>
            <Stack alignItems="center">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <MedicationIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                  {summary.activeMedCount}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>Meds</Typography>
            </Stack>

            <Stack alignItems="center">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                <Typography variant="subtitle2" fontWeight={700} color="warning.main">
                  {summary.allergiesCount}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>Allergies</Typography>
            </Stack>

            <Stack alignItems="center">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <EventIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={600} noWrap>
                  {formatRelativeDate(summary.lastEncounterDate)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>Last Visit</Typography>
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
