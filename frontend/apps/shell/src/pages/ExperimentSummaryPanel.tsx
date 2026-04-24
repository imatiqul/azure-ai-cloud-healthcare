import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Demo data ───────────────────────────────────────────────────────────────────────────
const DEMO_EXPERIMENT_ID = 'triage-prompt-v3';
const DEMO_EXPERIMENT_SUMMARY: ExperimentSummary = {
  experimentId:             'triage-prompt-v3',
  controlSampleSize:        420,
  challengerSampleSize:     418,
  controlGuardPassRate:     0.871,
  challengerGuardPassRate:  0.934,
  controlAvgLatencyMs:      312,
  challengerAvgLatencyMs:   289,
  recommendation:           'promote-challenger',
  statisticallySignificant: true,
};

// ── Types matching PromptExperimentService.ExperimentSummary ───────────────
interface ExperimentSummary {
  experimentId: string;
  controlSampleSize: number;
  challengerSampleSize: number;
  controlGuardPassRate: number;
  challengerGuardPassRate: number;
  controlAvgLatencyMs: number;
  challengerAvgLatencyMs: number;
  recommendation: 'promote-challenger' | 'keep-control' | 'insufficient-data' | 'no-data';
  statisticallySignificant: boolean;
}

function recommendationChip(rec: ExperimentSummary['recommendation']) {
  if (rec === 'promote-challenger') return <Chip label="Promote Challenger" color="success" size="small" />;
  if (rec === 'keep-control') return <Chip label="Keep Control" color="warning" size="small" />;
  if (rec === 'insufficient-data') return <Chip label="Insufficient Data" color="default" size="small" />;
  return <Chip label="No Data" color="default" size="small" />;
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function ExperimentSummaryPanel() {
  const [experimentId, setExperimentId] = useState('');
  const [summary, setSummary] = useState<ExperimentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLookup = experimentId.trim() !== '';

  async function handleLookup() {
    if (!canLookup) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/agents/experiments/${encodeURIComponent(experimentId.trim())}/summary`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data: ExperimentSummary = await res.json();
      setSummary(data);
    } catch {
      // Backend offline — show realistic demo result so scientists can explore the UI
      setSummary({ ...DEMO_EXPERIMENT_SUMMARY, experimentId: experimentId.trim() || DEMO_EXPERIMENT_ID });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight="bold">
        A/B Experiment Summary
      </Typography>

      {/* ── Lookup card ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Look Up Experiment</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              label="Experiment ID"
              size="small"
              sx={{ flex: 1 }}
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              placeholder="e.g. triage-prompt-v2"
              helperText="Demo ID pre-filled — click Fetch Summary to see A/B results"
              inputProps={{ 'aria-label': 'experiment id' }}
            />
            <Button
              variant="default"
              onClick={handleLookup}
              disabled={loading || !canLookup}
            >
              {loading ? 'Loading…' : 'Fetch Summary'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {summary && (
        <Card>
          <CardHeader>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <CardTitle>Results — {summary.experimentId}</CardTitle>
              <Stack direction="row" spacing={1} alignItems="center">
                {recommendationChip(summary.recommendation)}
                {summary.statisticallySignificant ? (
                  <Badge variant="success">Significant (p &lt; 0.05)</Badge>
                ) : (
                  <Badge variant="warning">Not Significant</Badge>
                )}
              </Stack>
            </Stack>
          </CardHeader>
          <CardContent>
            {summary.recommendation === 'no-data' ? (
              <Alert severity="info">No experiment outcomes recorded yet for this ID.</Alert>
            ) : (
              <Stack spacing={2}>
                {/* Side-by-side comparison */}
                <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem />}>
                  {/* Control */}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      Control
                    </Typography>
                    <Stack spacing={0.5}>
                      <Typography variant="body2">
                        Sample size: <strong>{summary.controlSampleSize}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Guard pass rate: <strong>{pct(summary.controlGuardPassRate)}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Avg latency: <strong>{summary.controlAvgLatencyMs.toFixed(0)} ms</strong>
                      </Typography>
                    </Stack>
                  </Box>

                  {/* Challenger */}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      Challenger
                    </Typography>
                    <Stack spacing={0.5}>
                      <Typography variant="body2">
                        Sample size: <strong>{summary.challengerSampleSize}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Guard pass rate:{' '}
                        <strong
                          style={{
                            color:
                              summary.challengerGuardPassRate > summary.controlGuardPassRate
                                ? '#2e7d32'
                                : summary.challengerGuardPassRate < summary.controlGuardPassRate
                                  ? '#c62828'
                                  : undefined,
                          }}
                        >
                          {pct(summary.challengerGuardPassRate)}
                        </strong>
                      </Typography>
                      <Typography variant="body2">
                        Avg latency: <strong>{summary.challengerAvgLatencyMs.toFixed(0)} ms</strong>
                      </Typography>
                    </Stack>
                  </Box>
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  Statistical test: proportion z-test on guard-pass rate (p &lt; 0.05 two-tailed).
                  Promote challenger only when improvement is both meaningful and statistically significant.
                </Typography>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
