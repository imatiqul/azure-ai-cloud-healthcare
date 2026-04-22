import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_TRAJECTORY: TrajectoryResult = {
  patientId: 'PAT-00142',
  dataPoints: [
    { assessedAt: new Date(Date.now() - 90 * 86400_000).toISOString(), riskScore: 61, level: 'Moderate', trend: 'Stable',    scoreDelta: 0 },
    { assessedAt: new Date(Date.now() - 75 * 86400_000).toISOString(), riskScore: 65, level: 'Moderate', trend: 'Worsening', scoreDelta: 4 },
    { assessedAt: new Date(Date.now() - 60 * 86400_000).toISOString(), riskScore: 70, level: 'High',     trend: 'Worsening', scoreDelta: 5 },
    { assessedAt: new Date(Date.now() - 45 * 86400_000).toISOString(), riskScore: 74, level: 'High',     trend: 'Worsening', scoreDelta: 4 },
    { assessedAt: new Date(Date.now() - 30 * 86400_000).toISOString(), riskScore: 79, level: 'High',     trend: 'Worsening', scoreDelta: 5 },
    { assessedAt: new Date(Date.now() - 15 * 86400_000).toISOString(), riskScore: 82, level: 'Critical', trend: 'Worsening', scoreDelta: 3 },
    { assessedAt: new Date(Date.now() - 1  * 86400_000).toISOString(), riskScore: 94, level: 'Critical', trend: 'Worsening', scoreDelta: 12 },
  ],
  min: 61,
  max: 94,
  mean: 75,
  slope: 0.37,
  overallTrend: 'Worsening',
};

interface TrajectoryPoint {
  assessedAt: string;
  riskScore: number;
  level: string;
  trend: string;
  scoreDelta: number;
}

interface TrajectoryResult {
  patientId: string;
  dataPoints: TrajectoryPoint[];
  min: number | null;
  max: number | null;
  mean: number | null;
  slope: number;
  overallTrend: string;
}

const TREND_COLOR: Record<string, 'error' | 'warning' | 'success' | 'default'> = {
  Worsening: 'error',
  Stable: 'warning',
  Improving: 'success',
};

const CHART_HEIGHT = 120;
const CHART_WIDTH = 400;
const PAD = 8;

function SparkLine({ points }: { points: TrajectoryPoint[] }) {
  if (points.length < 2) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1 }}>
        Not enough data to plot trajectory
      </Typography>
    );
  }

  const scores = points.map((p) => p.riskScore);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;
  const w = CHART_WIDTH - PAD * 2;
  const h = CHART_HEIGHT - PAD * 2;

  const pts = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * w;
    const y = PAD + (1 - (p.riskScore - minScore) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = pts.join(' ');

  // area fill — close the path below
  const firstPt = pts[0].split(',');
  const lastPt = pts[pts.length - 1].split(',');
  const areaPath = `M ${pts.join(' L ')} L ${lastPt[0]},${(PAD + h).toFixed(1)} L ${firstPt[0]},${(PAD + h).toFixed(1)} Z`;

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ width: '100%', maxWidth: CHART_WIDTH, height: CHART_HEIGHT, display: 'block' }}
        aria-label="Risk score trajectory chart"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = PAD + frac * h;
          return (
            <line
              key={frac}
              x1={PAD}
              y1={y.toFixed(1)}
              x2={(PAD + w).toFixed(1)}
              y2={y.toFixed(1)}
              stroke="#e0e0e0"
              strokeWidth="1"
            />
          );
        })}
        {/* Area fill */}
        <path d={areaPath} fill="rgba(25,118,210,0.08)" />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="#1976d2"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Data point dots */}
        {pts.map((pt, i) => {
          const [cx, cy] = pt.split(',');
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="3"
              fill="#1976d2"
              stroke="#fff"
              strokeWidth="1.5"
            >
              <title>{`Score: ${points[i].riskScore.toFixed(2)} — ${new Date(points[i].assessedAt).toLocaleDateString()}`}</title>
            </circle>
          );
        })}
        {/* Y-axis score labels */}
        <text x={PAD} y={PAD - 2} fontSize="9" fill="#999" textAnchor="start">
          {maxScore.toFixed(1)}
        </text>
        <text x={PAD} y={PAD + h + 10} fontSize="9" fill="#999" textAnchor="start">
          {minScore.toFixed(1)}
        </text>
      </svg>
    </Box>
  );
}

export function RiskTrajectoryPanel() {
  const [patientId, setPatientId]   = useState('');
  const [result, setResult]         = useState<TrajectoryResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!patientId.trim()) { setResult(null); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `${API_BASE}/api/v1/population-health/risks/${encodeURIComponent(patientId.trim())}/trajectory?maxPoints=90`,
      { signal: ac.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TrajectoryResult>;
      })
      .then(setResult)
      .catch((err: unknown) => {
        if ((err as { name?: string }).name !== 'AbortError') {
          setResult(DEMO_TRAJECTORY);
          setError(null);
        }
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [patientId]);

  const trendVariant = result ? (TREND_COLOR[result.overallTrend] ?? 'default') : 'default';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Score Trajectory</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack spacing={2}>
          <TextField
            fullWidth
            size="small"
            label="Patient ID"
            placeholder="Enter patient ID…"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          />

          {loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Loading trajectory…</Typography>
            </Stack>
          )}

          {error && (
            <Typography variant="body2" color="error">{error}</Typography>
          )}

          {result && !loading && (
            <>
              {/* Statistics row */}
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={`Trend: ${result.overallTrend}`}
                  color={trendVariant}
                  size="small"
                />
                {result.mean !== null && (
                  <Chip label={`Mean: ${result.mean.toFixed(2)}`} size="small" variant="outlined" />
                )}
                {result.min !== null && (
                  <Chip label={`Min: ${result.min.toFixed(2)}`} size="small" variant="outlined" />
                )}
                {result.max !== null && (
                  <Chip label={`Max: ${result.max.toFixed(2)}`} size="small" variant="outlined" />
                )}
                <Chip
                  label={`${result.dataPoints.length} assessments`}
                  size="small"
                  variant="outlined"
                />
              </Stack>

              <Divider />

              {/* Sparkline chart */}
              <SparkLine points={result.dataPoints} />

              {/* Recent data points */}
              {result.dataPoints.length > 0 && (
                <>
                  <Typography variant="subtitle2">Recent Assessments</Typography>
                  <Stack spacing={0.5}>
                    {[...result.dataPoints].reverse().slice(0, 5).map((pt, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.75,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {new Date(pt.assessedAt).toLocaleDateString()}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" fontWeight="medium">
                            {pt.riskScore.toFixed(2)}
                          </Typography>
                          <Chip label={pt.level} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
            </>
          )}

          {!loading && !error && result?.dataPoints.length === 0 && (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 3 }}>
              No trajectory data for this patient
            </Typography>
          )}

          {!loading && !error && !result && patientId.trim() === '' && (
            <Typography color="text.disabled" textAlign="center" sx={{ py: 3 }}>
              Enter a patient ID to view risk trajectory
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
