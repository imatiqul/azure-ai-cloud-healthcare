import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, CircularProgress, Alert,
  Card, CardContent, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsightsIcon from '@mui/icons-material/Insights';
import { Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

const DEMO_SESSIONS: DemoSessionSummary[] = [
  { sessionId: 'demo-001', clientName: 'Rachel Kim',     company: 'Apex Health',         status: 'Completed',  lastStep: 'PopulationHealth', npsScore: 9,    avgRating: 4.5, startedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),  completedAt: new Date(Date.now() - 2 * 86400_000 + 35 * 60_000).toISOString() },
  { sessionId: 'demo-002', clientName: 'James Liu',      company: 'MedCore Partners',    status: 'Completed',  lastStep: 'RevenueCycle',     npsScore: 8,    avgRating: 4.2, startedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),  completedAt: new Date(Date.now() - 3 * 86400_000 + 28 * 60_000).toISOString() },
  { sessionId: 'demo-003', clientName: 'Sandra Ortiz',   company: 'ClearPath Medical',   status: 'Completed',  lastStep: 'PopulationHealth', npsScore: 10,   avgRating: 4.8, startedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),  completedAt: new Date(Date.now() - 5 * 86400_000 + 42 * 60_000).toISOString() },
  { sessionId: 'demo-004', clientName: 'Michael Brown',  company: 'HealthFirst Systems',  status: 'InProgress', lastStep: 'Scheduling',       npsScore: null, avgRating: 3.8, startedAt: new Date(Date.now() - 1 * 86400_000).toISOString(),  completedAt: null },
  { sessionId: 'demo-005', clientName: 'Emily Watson',   company: 'Sunrise Clinics',     status: 'Completed',  lastStep: 'PopulationHealth', npsScore: 7,    avgRating: 4.0, startedAt: new Date(Date.now() - 7 * 86400_000).toISOString(),  completedAt: new Date(Date.now() - 7 * 86400_000 + 38 * 60_000).toISOString() },
];

interface DemoSessionSummary {
  sessionId: string;
  clientName: string;
  company: string;
  status: string;
  lastStep: string;
  npsScore: number | null;
  avgRating: number | null;
  startedAt: string;
  completedAt: string | null;
}

interface DemoInsight {
  id: string;
  generatedAt: string;
  sessionsAnalyzed: number;
  averageNps: number;
  topStrengths: string;
  topWeaknesses: string;
  recommendations: string;
}

export default function DemoAdminPanel() {
  const [sessions, setSessions] = useState<DemoSessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [insight, setInsight] = useState<DemoInsight | null>(null);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const inFlightRequest = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async () => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/demo/sessions`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!controller.signal.aborted) setSessions(data);
    } catch (err) {
      if (!isAbortLikeError(err) && !controller.signal.aborted) setSessions(DEMO_SESSIONS);
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) {
        inFlightRequest.current = null;
        setLoadingSessions(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
    return () => { inFlightRequest.current?.abort(); };
  }, [fetchSessions]);

  const generateInsights = useCallback(async () => {
    setGeneratingInsight(true);
    setInsightError(null);
    setInsight(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/demo/insights`, { signal: AbortSignal.timeout(10_000), method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setInsight(data);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setGeneratingInsight(false);
    }
  }, []);

  const statusVariant = (status: string) =>
    status === 'Completed' ? 'success' : status === 'InProgress' ? 'warning' : 'default';

  const completedCount = sessions.filter(s => s.status === 'Completed').length;
  const avgNps = sessions
    .filter(s => s.npsScore !== null)
    .reduce((sum, s, _, arr) => sum + (s.npsScore ?? 0) / arr.length, 0);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5">Demo Admin Panel</Typography>
        <Box display="flex" gap={1}>
          <Chip label={`${sessions.length} total`} />
          <Chip label={`${completedCount} completed`} color="success" />
          {sessions.some(s => s.npsScore !== null) && (
            <Chip label={`Avg NPS: ${avgNps.toFixed(1)}`} color="primary" />
          )}
        </Box>
      </Box>

      {/* Sessions Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">Demo Sessions</Typography>
            <IconButton onClick={fetchSessions} disabled={loadingSessions} aria-label="refresh sessions">
              {loadingSessions ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </Box>

          {sessionsError && <Alert severity="error" sx={{ mb: 1 }}>{sessionsError}</Alert>}

          {sessions.length === 0 && !loadingSessions ? (
            <Alert severity="info">No demo sessions found.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Step</TableCell>
                  <TableCell>NPS</TableCell>
                  <TableCell>Avg Rating</TableCell>
                  <TableCell>Started</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map(s => (
                  <TableRow key={s.sessionId}>
                    <TableCell>{s.clientName}</TableCell>
                    <TableCell>{s.company}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(s.status) as 'success' | 'warning' | 'default'}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={s.lastStep} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {s.npsScore !== null ? (
                        <Chip
                          size="small"
                          label={s.npsScore}
                          color={s.npsScore >= 8 ? 'success' : s.npsScore >= 6 ? 'warning' : 'error'}
                        />
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {s.avgRating !== null ? s.avgRating?.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell>
                      {new Date(s.startedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">AI Insights from Demo Feedback</Typography>
            <Button
              variant="contained"
              startIcon={generatingInsight ? <CircularProgress size={16} /> : <InsightsIcon />}
              onClick={generateInsights}
              disabled={generatingInsight}
            >
              Generate Insights
            </Button>
          </Box>

          {insightError && <Alert severity="error" sx={{ mb: 2 }}>{insightError}</Alert>}

          {insight && (
            <Box>
              <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                <Chip label={`${insight.sessionsAnalyzed} sessions analyzed`} />
                <Chip label={`Avg NPS: ${insight.averageNps}`} color="primary" />
                <Chip size="small" label={new Date(insight.generatedAt).toLocaleString()} variant="outlined" />
              </Box>
              <Box display="flex" flexDirection="column" gap={1}>
                <Box>
                  <Typography variant="subtitle2" color="success.main">Top Strengths</Typography>
                  <Typography variant="body2">{insight.topStrengths}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="warning.main">Top Weaknesses</Typography>
                  <Typography variant="body2">{insight.topWeaknesses}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Recommendations</Typography>
                  <Typography variant="body2">{insight.recommendations}</Typography>
                </Box>
              </Box>
            </Box>
          )}

          {!insight && !insightError && (
            <Alert severity="info">
              Click "Generate Insights" to run AI analysis on all completed demo feedback.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
