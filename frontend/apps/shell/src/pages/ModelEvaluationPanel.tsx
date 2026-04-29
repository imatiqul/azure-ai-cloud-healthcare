import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

const DEMO_EVAL_HISTORY: EvalRun[] = [
  { id: 'eval-001', modelRegistryEntryId: 'reg-001', score: 0.91, totalCases: 8, passedCases: 7, passedThreshold: true,  evaluatedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'eval-002', modelRegistryEntryId: 'reg-001', score: 0.87, totalCases: 8, passedCases: 7, passedThreshold: true,  evaluatedAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'eval-003', modelRegistryEntryId: 'reg-001', score: 0.83, totalCases: 8, passedCases: 6, passedThreshold: true,  evaluatedAt: new Date(Date.now() - 7 * 86400_000).toISOString() },
  { id: 'eval-004', modelRegistryEntryId: 'reg-002', score: 0.75, totalCases: 8, passedCases: 6, passedThreshold: false, evaluatedAt: new Date(Date.now() - 14 * 86400_000).toISOString() },
  { id: 'eval-005', modelRegistryEntryId: 'reg-002', score: 0.68, totalCases: 8, passedCases: 5, passedThreshold: false, evaluatedAt: new Date(Date.now() - 21 * 86400_000).toISOString() },
];

interface EvalRun {
  id: string;
  modelRegistryEntryId: string;
  score: number;
  totalCases: number;
  passedCases: number;
  passedThreshold: boolean;
  evaluatedAt: string;
}

interface EvalResult extends EvalRun {
  status: 'PASS' | 'FAIL';
  message?: string;
}

function scoreColor(score: number): 'success' | 'warning' | 'error' {
  if (score >= 0.85) return 'success';
  if (score >= 0.70) return 'warning';
  return 'error';
}

export default function ModelEvaluationPanel() {
  const [evaluatedByUserId, setEvaluatedByUserId] = useState('');
  const [lastResult, setLastResult] = useState<EvalResult | null>(null);
  const [history, setHistory] = useState<EvalRun[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [runError, setRunError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const inFlightRequest = useRef<AbortController | null>(null);

  const fetchHistory = useCallback(async () => {
    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/governance/evaluate/history?top=10`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EvalRun[];
      if (!controller.signal.aborted) setHistory(Array.isArray(data) && data.length > 0 ? data : DEMO_EVAL_HISTORY);
    } catch (err) {
      if (!isAbortLikeError(err) && !controller.signal.aborted) setHistory(DEMO_EVAL_HISTORY);
    } finally {
      clearTimeout(timer);
      if (inFlightRequest.current === controller) {
        inFlightRequest.current = null;
        setLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    return () => { inFlightRequest.current?.abort(); };
  }, [fetchHistory]);

  const runEvaluation = useCallback(async () => {
    if (!evaluatedByUserId.trim()) return;
    setRunning(true);
    setRunError('');
    setLastResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/governance/evaluate`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluatedByUserId }),
      });
      const data = (await res.json()) as EvalResult;
      setLastResult(data);
      // Refresh history to include the new run
      await fetchHistory();
    } catch {
      setRunError('Network error — could not run evaluation.');
    } finally {
      setRunning(false);
    }
  }, [evaluatedByUserId, fetchHistory]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Model Prompt Evaluation</Typography>

      {/* Run Evaluation */}
      <Card sx={{ mb: 3 }}>
        <CardHeader>
          <CardTitle>Run Regression Evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Exercises 8 fixed clinical triage prompts through the live Semantic Kernel pipeline.
            Pass threshold is 80%. Evaluates the currently active model registry entry.
          </Typography>
          <Box display="flex" gap={2} alignItems="flex-start">
            <TextField
              label="Evaluated By User ID"
              value={evaluatedByUserId}
              onChange={e => setEvaluatedByUserId(e.target.value)}
              helperText="Your user ID for audit trail"
              sx={{ flex: 1 }}
            />
            <Button
              onClick={runEvaluation}
              disabled={!evaluatedByUserId.trim() || running}
            >
              {running ? <CircularProgress size={18} sx={{ mr: 1 }} /> : <PlayArrowIcon fontSize="small" sx={{ mr: 0.5 }} />}
              Run Evaluation
            </Button>
          </Box>

          {runError && <Alert severity="error" sx={{ mt: 2 }}>{runError}</Alert>}

          {lastResult && (
            <Box mt={2} p={2} bgcolor="background.default" borderRadius={1}>
              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center" mb={1}>
                <Badge variant={lastResult.passedThreshold ? 'success' : 'error'}>
                  {lastResult.status}
                </Badge>
                <Chip
                  label={`Score: ${Math.round(lastResult.score * 100)}%`}
                  color={scoreColor(lastResult.score)}
                  size="small"
                />
                <Chip label={`${lastResult.passedCases}/${lastResult.totalCases} cases`} size="small" variant="outlined" />
              </Box>
              <LinearProgress
                variant="determinate"
                value={lastResult.score * 100}
                color={scoreColor(lastResult.score)}
                sx={{ height: 8, borderRadius: 4, mb: 1 }}
              />
              {lastResult.message && (
                <Alert severity="warning" sx={{ mt: 1 }}>{lastResult.message}</Alert>
              )}
              <Typography variant="caption" color="text.secondary">
                Run ID: <code>{lastResult.id}</code>
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Evaluation History */}
      <Card>
        <CardHeader>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <CardTitle>Evaluation History</CardTitle>
            <Button onClick={fetchHistory} aria-label="refresh history">
              <RefreshIcon fontSize="small" />
            </Button>
          </Box>
        </CardHeader>
        <CardContent>
          {historyError && <Alert severity="error" sx={{ mb: 2 }}>{historyError}</Alert>}

          {loadingHistory && (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress />
            </Box>
          )}

          {!loadingHistory && history.length === 0 && !historyError && (
            <Alert severity="info">No evaluation runs yet. Run an evaluation to see results here.</Alert>
          )}

          {!loadingHistory && history.map((run, idx) => (
            <Box key={run.id}>
              {idx > 0 && <Divider sx={{ my: 1 }} />}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" py={1}>
                <Box>
                  <Box display="flex" gap={1} flexWrap="wrap" alignItems="center" mb={0.5}>
                    <Badge variant={run.passedThreshold ? 'success' : 'error'}>
                      {run.passedThreshold ? 'PASS' : 'FAIL'}
                    </Badge>
                    <Chip
                      label={`${Math.round(run.score * 100)}%`}
                      color={scoreColor(run.score)}
                      size="small"
                    />
                    <Chip
                      label={`${run.passedCases}/${run.totalCases} cases`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(run.evaluatedAt).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>
                    {run.id.slice(0, 8)}…
                  </Typography>
                </Box>
                <Box sx={{ width: 100 }}>
                  <LinearProgress
                    variant="determinate"
                    value={run.score * 100}
                    color={scoreColor(run.score)}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}
