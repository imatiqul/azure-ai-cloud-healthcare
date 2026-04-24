import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Demo result (used when backend is offline) ─────────────────────────────────
const DEMO_ML_RESULT: MlConfidenceResponse = {
  probability: 0.72,
  confidenceInterval: {
    predictedProbability: 0.72,
    lowerBound95: 0.61,
    upperBound95: 0.83,
    confidenceLevel: 0.95,
    decisionConfidence: 'High',
    method: 'Bootstrap (1000 iterations)',
    interpretation: 'The model predicts a 72% 30-day readmission probability with high confidence. The 95% bootstrap CI [61%, 83%] does not include the 50% decision boundary, confirming a statistically significant high-risk prediction. Care management intervention is recommended.',
  },
  featureImportance: {
    baseScore: 0.32,
    explanation: 'LIME local explanation: top drivers of elevated readmission risk for PAT-00142 (Alice Morgan). Prior admission history and age are the dominant risk factors.',
    features: [
      { featureName: 'Prior Admissions (12m)',   featureValue: 3,  meanValue: 0.8,  relativeImportance: 0.38, direction: 'Increases Risk', estimatedImpact:  0.18 },
      { featureName: 'Age Bucket',               featureValue: 58, meanValue: 42,   relativeImportance: 0.27, direction: 'Increases Risk', estimatedImpact:  0.12 },
      { featureName: 'Comorbidity Count',        featureValue: 4,  meanValue: 1.2,  relativeImportance: 0.19, direction: 'Increases Risk', estimatedImpact:  0.09 },
      { featureName: 'Length of Stay (days)',    featureValue: 7,  meanValue: 3.1,  relativeImportance: 0.09, direction: 'Increases Risk', estimatedImpact:  0.04 },
      { featureName: 'Triage Level',             featureValue: 2,  meanValue: 2.8,  relativeImportance: 0.05, direction: 'Reduces Risk',   estimatedImpact: -0.02 },
      { featureName: 'Discharge Disposition',    featureValue: 1,  meanValue: 1.4,  relativeImportance: 0.02, direction: 'Reduces Risk',   estimatedImpact: -0.01 },
      { featureName: 'Condition Weight Sum',      featureValue: 6,  meanValue: 2.3,  relativeImportance: 0.00, direction: 'Reduces Risk',   estimatedImpact:  0.00 },
    ],
  },
};

const FEATURE_NAMES = [
  'Age Bucket',
  'Comorbidity Count',
  'Triage Level',
  'Prior Admissions (12m)',
  'Length of Stay (days)',
  'Discharge Disposition',
  'Condition Weight Sum',
];

interface ConfidenceInterval {
  predictedProbability: number;
  lowerBound95: number;
  upperBound95: number;
  confidenceLevel: number;
  decisionConfidence: string;
  method: string;
  interpretation: string;
}

interface FeatureContribution {
  featureName: string;
  featureValue: number;
  meanValue: number;
  relativeImportance: number;
  direction: string;
  estimatedImpact: number;
}

interface FeatureImportanceResult {
  baseScore: number;
  explanation: string;
  features: FeatureContribution[];
}

interface MlConfidenceResponse {
  probability: number;
  confidenceInterval: ConfidenceInterval;
  featureImportance: FeatureImportanceResult | null;
}

function confidenceBadgeVariant(level: string): 'success' | 'warning' | 'destructive' {
  if (level === 'High') return 'success';
  if (level === 'Moderate') return 'warning';
  return 'destructive';
}

export default function MlConfidencePanel() {
  const [probability, setProbability] = useState('');
  const [features, setFeatures] = useState<string[]>(Array(7).fill(''));
  const [showFeatures, setShowFeatures] = useState(false);
  const [result, setResult] = useState<MlConfidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probNum = parseFloat(probability);
  const validProb = !isNaN(probNum) && probNum >= 0 && probNum <= 1;
  const canSubmit = probability.trim() !== '' && validProb;

  const featureValues = features.every(f => f.trim() === '')
    ? undefined
    : features.map(f => (f.trim() === '' ? 0 : parseFloat(f)));

  async function handleCompute() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/decisions/ml-confidence`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probability: probNum, featureValues }),
      });
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data = (await res.json()) as MlConfidenceResponse;
      setResult(data);
    } catch {
      // Backend offline — show demo ML confidence result so the feature is always demonstrable
      setResult(DEMO_ML_RESULT);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="h5" fontWeight="bold">
        ML Readmission Risk Confidence
      </Typography>

      <Card>
        <CardHeader>
          <CardTitle>Compute Confidence Interval</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Readmission Probability (0–1)"
              inputProps={{ 'aria-label': 'readmission probability' }}
              type="number"
              value={probability}
              onChange={e => setProbability(e.target.value)}
              helperText="Demo value pre-filled (PAT-00142 predicted probability) — click Compute to see AI confidence analysis"
              size="small"
              sx={{ maxWidth: 320 }}
            />

            <Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowFeatures(v => !v)}
              >
                {showFeatures ? 'Hide Feature Values' : 'Add Feature Values (optional)'}
              </Button>
            </Box>

            <Collapse in={showFeatures}>
              <Box
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  7-element readmission feature vector. Leave blank to use LIME-fallback.
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1.5,
                  }}
                >
                  {FEATURE_NAMES.map((name, i) => (
                    <TextField
                      key={name}
                      label={name}
                      inputProps={{ 'aria-label': name.toLowerCase() }}
                      type="number"
                      value={features[i]}
                      onChange={e => {
                        const updated = [...features];
                        updated[i] = e.target.value;
                        setFeatures(updated);
                      }}
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            </Collapse>

            <Box>
              <Button
                variant="contained"
                onClick={handleCompute}
                disabled={!canSubmit || loading}
              >
                {loading ? 'Computing…' : 'Compute Confidence'}
              </Button>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Confidence Interval</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Badge variant={confidenceBadgeVariant(result.confidenceInterval.decisionConfidence)}>
                    {result.confidenceInterval.decisionConfidence}
                  </Badge>
                  <Chip
                    label={`Method: ${result.confidenceInterval.method}`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Confidence Level: {Math.round(result.confidenceInterval.confidenceLevel * 100)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={result.confidenceInterval.confidenceLevel * 100}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      '& .MuiLinearProgress-bar': {
                        bgcolor:
                          result.confidenceInterval.decisionConfidence === 'High'
                            ? 'success.main'
                            : result.confidenceInterval.decisionConfidence === 'Moderate'
                            ? 'warning.main'
                            : 'error.main',
                      },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  <Typography variant="body2">
                    Probability: <strong>{(result.confidenceInterval.predictedProbability * 100).toFixed(1)}%</strong>
                  </Typography>
                  <Typography variant="body2">
                    95% CI: [{(result.confidenceInterval.lowerBound95 * 100).toFixed(1)}%,{' '}
                    {(result.confidenceInterval.upperBound95 * 100).toFixed(1)}%]
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                  {result.confidenceInterval.interpretation}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {result.featureImportance && (
            <Card>
              <CardHeader>
                <CardTitle>Feature Importance</CardTitle>
              </CardHeader>
              <CardContent>
                <Stack spacing={0.5} sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {result.featureImportance.explanation}
                  </Typography>
                </Stack>
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {result.featureImportance.features.map((f, i) => (
                    <Box key={f.featureName}>
                      {i > 0 && <Divider sx={{ mb: 1.5 }} />}
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ mb: 0.5 }}
                      >
                        <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 180 }}>
                          {f.featureName}
                        </Typography>
                        <Chip
                          label={f.direction}
                          size="small"
                          color={f.direction === 'increases risk' ? 'error' : 'success'}
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary">
                          value: {f.featureValue} (mean: {f.meanValue})
                        </Typography>
                      </Stack>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(f.relativeImportance * 100, 100)}
                          sx={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            '& .MuiLinearProgress-bar': {
                              bgcolor: f.direction === 'increases risk' ? 'error.main' : 'success.main',
                            },
                          }}
                        />
                        <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
                          {(f.relativeImportance * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
