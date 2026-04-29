import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalStore } from '../store';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Popper from '@mui/material/Popper';
import Paper from '@mui/material/Paper';
import InputBase from '@mui/material/InputBase';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import PersonIcon from '@mui/icons-material/Person';
import HistoryIcon from '@mui/icons-material/History';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Alert from '@mui/material/Alert';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const RECENT_KEY = 'hq:recent-patients';
const MAX_RECENT = 5;

const DEMO_RISKS: PatientRisk[] = [
  // Elderly (65+)
  { id: 'risk-001', patientId: 'PAT-00142', level: 'Critical', riskScore: 94, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'risk-002', patientId: 'PAT-00278', level: 'Critical', riskScore: 91, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: 'risk-015', patientId: 'PAT-00715', level: 'Critical', riskScore: 92, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() }, // Dorothy Hughes, 80, Alzheimer's
  { id: 'risk-016', patientId: 'PAT-00816', level: 'Critical', riskScore: 96, assessedAt: new Date(Date.now() - 0.5 * 86400_000).toISOString() }, // Warren Baptiste, 87, CHF+AFib
  // Adult (36–64)
  { id: 'risk-003', patientId: 'PAT-00315', level: 'High',     riskScore: 82, assessedAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'risk-004', patientId: 'PAT-00089', level: 'High',     riskScore: 78, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'risk-013', patientId: 'PAT-00513', level: 'High',     riskScore: 80, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() }, // Carlos Mendez, 45, Colorectal Cancer
  { id: 'risk-014', patientId: 'PAT-00614', level: 'High',     riskScore: 78, assessedAt: new Date(Date.now() - 3 * 86400_000).toISOString() }, // Fatima Al-Hassan, 53, MS
  // Young Adult (18–35)
  { id: 'risk-005', patientId: 'PAT-00456', level: 'High',     riskScore: 75, assessedAt: new Date(Date.now() - 4 * 86400_000).toISOString() },
  { id: 'risk-011', patientId: 'PAT-00311', level: 'High',     riskScore: 74, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() }, // Tyler Reeves, 22, Depression+SUD
  { id: 'risk-012', patientId: 'PAT-00412', level: 'Critical', riskScore: 89, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() }, // Priya Sharma, 27, SLE+Lupus Nephritis
  { id: 'risk-006', patientId: 'PAT-00201', level: 'Moderate', riskScore: 61, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  // Pediatric (0–17)
  { id: 'risk-009', patientId: 'PAT-00109', level: 'Critical', riskScore: 93, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() }, // Noah Patel, 11, Severe Asthma
  { id: 'risk-010', patientId: 'PAT-00210', level: 'High',     riskScore: 77, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() }, // Aisha Johnson, 16, T1DM+ADHD
  { id: 'risk-007', patientId: 'PAT-00333', level: 'Moderate', riskScore: 55, assessedAt: new Date(Date.now() - 5 * 86400_000).toISOString() },
  { id: 'risk-008', patientId: 'PAT-00099', level: 'Low',      riskScore: 32, assessedAt: new Date(Date.now() - 6 * 86400_000).toISOString() },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientRisk {
  id: string;
  patientId: string;
  level: string;
  riskScore: number;
  assessedAt: string;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export function loadRecentPatients(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveRecentPatient(patientId: string): void {
  const prev = loadRecentPatients().filter(id => id !== patientId);
  localStorage.setItem(RECENT_KEY, JSON.stringify([patientId, ...prev].slice(0, MAX_RECENT)));
}

// ── Risk colour helper ────────────────────────────────────────────────────────

function riskChipColor(level: string): 'error' | 'warning' | 'default' | 'success' {
  switch (level) {
    case 'Critical': return 'error';
    case 'High':     return 'warning';
    case 'Moderate': return 'default';
    default:         return 'success';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PatientQuickSearch() {
  const navigate          = useNavigate();
  const setActivePatient  = useGlobalStore(s => s.setActivePatient);
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [risks, setRisks]     = useState<PatientRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recent, setRecent]   = useState<string[]>([]);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const inputRef  = useRef<HTMLInputElement | null>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRequest = useRef<AbortController | null>(null);

  const fetchRisks = useCallback(async (search?: string) => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/population-health/risks?top=20`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        const hasStatusCode = typeof res.status === 'number' && Number.isFinite(res.status);
        const statusText = typeof res.statusText === 'string' ? res.statusText.trim() : '';
        const statusLabel = hasStatusCode
          ? `${res.status}${statusText ? ` ${statusText}` : ''}`
          : 'request failed';
        setSearchError(`Patient risk search unavailable (${statusLabel}).`);
        setRisks([]);
        return;
      }
      const data: PatientRisk[] = await res.json();
      if (controller.signal.aborted) return;
      if (search) {
        const q = search.toLowerCase();
        setRisks(data.filter(r => r.patientId.toLowerCase().includes(q)));
      } else {
        setRisks(data.slice(0, 8));
      }
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) return;
      setSearchError('Patient risk search unavailable. Showing demo data.');
      setRisks(DEMO_RISKS.filter(r => !search || r.patientId.toLowerCase().includes(search.toLowerCase())));
    } finally {
      window.clearTimeout(timeoutId);
      if (inFlightRequest.current === controller) {
        inFlightRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  const openSearch = useCallback(() => {
    setRecent(loadRecentPatients());
    setQuery('');
    setRisks([]);
    setOpen(true);
    // focus input after popper renders
    setTimeout(() => inputRef.current?.focus(), 60);
    fetchRisks();
  }, [fetchRisks]);

  const closeSearch = useCallback(() => {
    inFlightRequest.current?.abort();
    inFlightRequest.current = null;
    setOpen(false);
    setQuery('');
    setLoading(false);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchRisks(val || undefined), 300);
  };

  const selectPatient = useCallback((patientId: string, riskLevel?: string) => {
    saveRecentPatient(patientId);
    setActivePatient({ id: patientId, riskLevel });
    closeSearch();
    navigate(`/encounters?patientId=${encodeURIComponent(patientId)}`);
  }, [closeSearch, navigate, setActivePatient]);

  // Keyboard shortcut: Ctrl+Shift+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        open ? closeSearch() : openSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, openSearch, closeSearch]);

  useEffect(() => {
    return () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
      }
      inFlightRequest.current?.abort();
    };
  }, []);

  // Derive display list
  const displayRisks = query
    ? risks
    : risks.filter(r => !recent.includes(r.patientId));

  return (
    <>
      <Tooltip title="Patient Search (Ctrl+Shift+P)">
        <IconButton
          size="small"
          ref={anchorRef}
          onClick={openSearch}
          aria-label="Open patient search"
        >
          <PersonSearchIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        sx={{ zIndex: 1400 }}
      >
        <ClickAwayListener onClickAway={closeSearch}>
          <Paper
            elevation={8}
            sx={{ width: 360, mt: 0.5, borderRadius: 2, overflow: 'hidden' }}
            role="dialog"
            aria-label="Patient search dialog"
          >
            {/* ── Search input ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
              <PersonIcon fontSize="small" sx={{ color: 'text.disabled', mr: 1, flexShrink: 0 }} />
              <InputBase
                inputRef={inputRef}
                value={query}
                onChange={handleQueryChange}
                placeholder="Search patient by ID…"
                fullWidth
                sx={{ fontSize: '0.875rem' }}
                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                inputProps={{ 'aria-label': 'Patient ID search' }}
              />
              {loading && <CircularProgress size={14} sx={{ ml: 1, flexShrink: 0 }} />}
            </Box>

            {/* ── Search error ── */}
            {searchError && (
              <Alert severity="error" sx={{ mx: 2, my: 1 }} onClose={() => setSearchError(null)}>
                {searchError}
              </Alert>
            )}

            {/* ── Recent patients ── */}
            {!query && recent.length > 0 && (
              <>
                <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <HistoryIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ letterSpacing: '0.06em' }}>
                      RECENT PATIENTS
                    </Typography>
                  </Stack>
                </Box>
                <List dense disablePadding>
                  {recent.map(pid => (
                    <ListItem key={pid} disablePadding>
                      <ListItemButton onClick={() => selectPatient(pid)} sx={{ px: 2, py: 0.75 }}>
                        <PersonIcon fontSize="small" sx={{ mr: 1.25, color: 'text.disabled', fontSize: 16 }} />
                        <ListItemText
                          primary={pid}
                          slotProps={{ primary: { variant: 'body2', fontWeight: 600 } }}
                        />
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="View Encounters">
                            <MedicalInformationIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          </Tooltip>
                        </Box>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                {displayRisks.length > 0 && <Divider />}
              </>
            )}

            {/* ── Risk results ── */}
            {displayRisks.length > 0 && (
              <>
                <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
                  <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ letterSpacing: '0.06em' }}>
                    {query ? 'SEARCH RESULTS' : 'ALL PATIENTS'}
                  </Typography>
                </Box>
                <List dense disablePadding>
                  {displayRisks.map(r => (
                    <ListItem key={r.id} disablePadding>
                      <ListItemButton onClick={() => selectPatient(r.patientId, r.level)} sx={{ px: 2, py: 0.75 }}>
                        <TrendingUpIcon fontSize="small" sx={{ mr: 1.25, color: 'text.disabled', fontSize: 16 }} />
                        <ListItemText
                          primary={r.patientId}
                          secondary={`Risk: ${Math.round(r.riskScore * 100)}%`}
                          slotProps={{
                            primary: { variant: 'body2', fontWeight: 600 },
                            secondary: { variant: 'caption' },
                          }}
                        />
                        <Chip
                          label={r.level}
                          size="small"
                          color={riskChipColor(r.level)}
                          sx={{ height: 18, fontSize: '0.65rem', ml: 1 }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {/* ── Empty state ── */}
            {!loading && displayRisks.length === 0 && recent.length === 0 && (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {query ? 'No patients found matching your search' : 'No patient data available'}
                </Typography>
              </Box>
            )}

            {/* ── Footer ── */}
            <Divider />
            <Box sx={{ px: 2, py: 0.75 }}>
              <Typography variant="caption" color="text.disabled">
                Selects patient → sets active context &amp; navigates to Encounters
              </Typography>
            </Box>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}
