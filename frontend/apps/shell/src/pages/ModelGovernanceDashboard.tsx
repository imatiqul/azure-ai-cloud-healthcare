import { useState, useEffect } from 'react';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_REGISTRY: ModelRegistryEntry[] = [
  { id: 'reg-001', modelName: 'ClinicalTriage',   modelVersion: 'v3.2.1', deploymentName: 'healthq-triage-gpt4o',  skVersion: '1.28.0', promptHash: 'sha256:a1b2c3d4', lastEvalScore: 0.91, deployedAt: new Date(Date.now() - 7 * 86400_000).toISOString(),  isActive: true  },
  { id: 'reg-002', modelName: 'ClinicalCoder',    modelVersion: 'v2.1.0', deploymentName: 'healthq-coder-gpt4o',  skVersion: '1.28.0', promptHash: 'sha256:e5f6g7h8', lastEvalScore: 0.87, deployedAt: new Date(Date.now() - 14 * 86400_000).toISOString(), isActive: true  },
  { id: 'reg-003', modelName: 'CostPredictor',   modelVersion: 'v1.5.3', deploymentName: 'healthq-cost-gpt4o',   skVersion: '1.27.0', promptHash: 'sha256:i9j0k1l2', lastEvalScore: 0.83, deployedAt: new Date(Date.now() - 21 * 86400_000).toISOString(), isActive: true  },
  { id: 'reg-004', modelName: 'ClinicalTriage',   modelVersion: 'v3.1.0', deploymentName: 'healthq-triage-gpt4o',  skVersion: '1.26.0', promptHash: 'sha256:m3n4o5p6', lastEvalScore: 0.78, deployedAt: new Date(Date.now() - 45 * 86400_000).toISOString(), isActive: false },
  { id: 'reg-005', modelName: 'RiskStratifier',  modelVersion: 'v2.0.0', deploymentName: 'healthq-risk-gpt4o',   skVersion: '1.28.0', promptHash: 'sha256:q7r8s9t0', lastEvalScore: 0.72, deployedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),  isActive: false },
];

interface ModelRegistryEntry {
  id: string;
  modelName: string;
  modelVersion: string;
  deploymentName: string;
  skVersion: string;
  promptHash: string;
  lastEvalScore: number | null;
  deployedAt: string;
  isActive: boolean;
}

function evalScoreColor(score: number | null): 'success' | 'warning' | 'error' | 'default' {
  if (score === null) return 'default';
  if (score >= 0.85) return 'success';
  if (score >= 0.70) return 'warning';
  return 'error';
}

// ── Eval score bar ─────────────────────────────────────────────────────────
function EvalScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <Typography variant="caption" color="text.secondary">
        Not evaluated
      </Typography>
    );
  }
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? '#4caf50' : score >= 0.70 ? '#ff9800' : '#f44336';
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <div
        style={{
          width: 80,
          height: 8,
          borderRadius: 4,
          background: '#e0e0e0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s',
          }}
        />
      </div>
      <Typography variant="caption" fontWeight={600} color={color}>
        {pct}%
      </Typography>
    </Stack>
  );
}

export default function ModelGovernanceDashboard() {
  const [entries, setEntries] = useState<ModelRegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchEntries() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/governance/history`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ModelRegistryEntry[] = await res.json();
      setEntries(data);
    } catch {
      setEntries(DEMO_REGISTRY);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
  }, []);

  const activeEntries = entries.filter((e) => e.isActive);
  const inactiveEntries = entries.filter((e) => !e.isActive);

  // Group entries by model name for the summary row
  const modelNames = [...new Set(entries.map((e) => e.modelName))];

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          AI Model Governance
        </Typography>
        <IconButton size="small" onClick={fetchEntries} disabled={loading} aria-label="refresh governance">
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Summary cards */}
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Active Models
              </Typography>
              <Typography variant="h4" fontWeight={700} color="success.main">
                {activeEntries.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Versions
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {entries.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Model Names
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {modelNames.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Avg Eval Score
              </Typography>
              <Typography
                variant="h4"
                fontWeight={700}
                color={
                  entries.filter((e) => e.lastEvalScore !== null).length > 0
                    ? evalScoreColor(
                        entries
                          .filter((e) => e.lastEvalScore !== null)
                          .reduce((sum, e) => sum + (e.lastEvalScore ?? 0), 0) /
                          entries.filter((e) => e.lastEvalScore !== null).length
                      ) + '.main'
                    : 'text.secondary'
                }
              >
                {entries.filter((e) => e.lastEvalScore !== null).length > 0
                  ? `${Math.round(
                      (entries
                        .filter((e) => e.lastEvalScore !== null)
                        .reduce((sum, e) => sum + (e.lastEvalScore ?? 0), 0) /
                        entries.filter((e) => e.lastEvalScore !== null).length) *
                        100
                    )}%`
                  : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Registry table */}
      <Card>
        <CardHeader>
          <CardTitle>Model Registry</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Loading registry…
              </Typography>
            </Stack>
          )}

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!loading && !error && entries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No model registry entries found.
            </Typography>
          )}

          <Stack spacing={2}>
            {entries.map((entry, idx) => (
              <Stack key={entry.id}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack spacing={0.5} flex={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" fontWeight={700}>
                        {entry.modelName}
                      </Typography>
                      <Chip label={`v${entry.modelVersion}`} size="small" variant="outlined" />
                      {entry.isActive && (
                        <Chip label="Active" color="success" size="small" />
                      )}
                    </Stack>

                    <Stack direction="row" spacing={2} flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        Deployment: {entry.deploymentName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        SK: {entry.skVersion}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Deployed: {new Date(entry.deployedAt).toLocaleString()}
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={2} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Prompt: <code>{entry.promptHash.slice(0, 12)}…</code>
                      </Typography>
                    </Stack>
                  </Stack>

                  <Stack alignItems="flex-end" spacing={0.5} sx={{ ml: 2, minWidth: 100 }}>
                    <Typography variant="caption" color="text.secondary">
                      Eval Score
                    </Typography>
                    <EvalScoreBar score={entry.lastEvalScore} />
                  </Stack>
                </Stack>

                {idx < entries.length - 1 && <Divider sx={{ mt: 1.5 }} />}
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
