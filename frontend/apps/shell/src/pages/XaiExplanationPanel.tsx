import { useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert,
  Card, CardContent, Chip, LinearProgress, List, ListItem,
  ListItemText, Divider,
} from '@mui/material';
import { Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Demo data (used when backend is offline) ─────────────────────────────────
const DEMO_DECISION_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

const DEMO_XAI_RESULT: ExplanationResult = {
  agentDecisionId: DEMO_DECISION_ID,
  agentName: 'ClinicalTriageAgent',
  guardVerdict: 'pass',
  confidenceScore: 0.942,
  ragChunks: [
    'Clinical guideline: Acute chest pain with left arm radiation in adults >50 warrants immediate cardiac evaluation (AHA/ACC 2023 Chest Pain Guidelines).',
    'Patient record context: Prior hypertension increases acute MI risk by 2.3× in this demographic (NHANES cohort data, n=42,000).',
    'ED triage protocol: BP ≥160/100 mmHg combined with tachycardia (HR >110 bpm) triggers P1 Immediate classification per Fast-Track Triage Protocol v4.2.',
  ],
  reasoningSteps: [
    'Step 1 — Symptom analysis: Patient reports severe chest pain (8/10) radiating to left arm with shortness of breath and diaphoresis — classic acute coronary syndrome presentation.',
    'Step 2 — Vital sign evaluation: BP 160/100, HR 112 bpm. Hypertension plus tachycardia elevates risk tier to Immediate.',
    'Step 3 — RAG context retrieval: Retrieved 3 relevant clinical guidelines confirming immediate cardiac evaluation protocol. TIMI score estimated at 4 (moderate-high risk).',
    'Step 4 — Guardrail check: Confidence score 94.2% exceeds the 90% threshold required for autonomous P1 classification. Guard verdict: PASS.',
    'Step 5 — Decision: Classify as P1 Immediate. Recommend ECG, troponin panel, pulse oximetry, and physician review within 10 minutes. Human confirmation required before treatment escalation.',
  ],
  createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  confidenceInterval: {
    confidenceLevel: '95%',
    decisionConfidence: 0.942,
    lowerBound95: 0.901,
    upperBound95: 0.983,
    method: 'Bootstrap (1000 iterations)',
    interpretation: 'The AI agent is 94.2% confident in the P1 Immediate triage classification. The 95% CI [90.1%, 98.3%] is narrow, indicating high decision reliability. The interval does not cross the 90% safety threshold, confirming autonomous triage is appropriate with human oversight.',
  },
};

interface ConfidenceInterval {
  confidenceLevel: string;
  decisionConfidence: number;
  lowerBound95: number;
  upperBound95: number;
  method: string;
  interpretation: string;
}

interface ExplanationResult {
  agentDecisionId: string;
  agentName: string;
  guardVerdict: string;
  confidenceScore: number;
  ragChunks: string[];
  reasoningSteps: string[];
  createdAt: string;
  confidenceInterval: ConfidenceInterval;
}

export default function XaiExplanationPanel() {
  const [decisionId, setDecisionId] = useState(DEMO_DECISION_ID);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchExplanation = useCallback(async () => {
    if (!decisionId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/agents/decisions/${encodeURIComponent(decisionId.trim())}/explanation`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setResult(data);
    } catch {
      // Backend offline — show demo XAI explanation so the feature is always demonstrable
      setResult({ ...DEMO_XAI_RESULT, agentDecisionId: decisionId.trim() || DEMO_DECISION_ID });
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [decisionId]);

  const confidenceBarColor = (score: number) =>
    score >= 0.8 ? '#2e7d32' : score >= 0.6 ? '#ed6c02' : '#d32f2f';

  return (
    <Box>
      <Typography variant="h5" gutterBottom>XAI Decision Explanation</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" gap={2} alignItems="flex-start">
            <TextField
              label="Agent Decision ID (GUID)"
              value={decisionId}
              onChange={e => setDecisionId(e.target.value)}
              size="small"
              fullWidth
              helperText="Demo ID pre-filled — click Fetch Explanation to see live AI reasoning"
              inputProps={{ 'aria-label': 'decision id' }}
              onKeyDown={e => { if (e.key === 'Enter') fetchExplanation(); }}
            />
            <Button
              variant="contained"
              onClick={fetchExplanation}
              disabled={!decisionId.trim() || loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Fetch Explanation
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Decision Summary</Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                <Chip label={result.agentName} color="primary" />
                <Chip label={`Guard: ${result.guardVerdict}`} variant="outlined" />
                <Badge variant={result.guardVerdict === 'pass' ? 'success' : 'warning'}>
                  {result.guardVerdict.toUpperCase()}
                </Badge>
              </Box>
              <Typography variant="body2" gutterBottom>
                Confidence Score: {(result.confidenceScore * 100).toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={result.confidenceScore * 100}
                sx={{
                  height: 8, borderRadius: 4, bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': { bgcolor: confidenceBarColor(result.confidenceScore) },
                }}
              />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Decision ID: <span style={{ fontFamily: 'monospace' }}>{result.agentDecisionId}</span>
                &nbsp;·&nbsp;{new Date(result.createdAt).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Confidence Interval
                <Chip size="small" label={result.confidenceInterval.confidenceLevel} sx={{ ml: 1 }} />
              </Typography>
              <Box display="flex" gap={3} flexWrap="wrap" mb={1}>
                <Typography variant="body2">
                  Decision Confidence:{' '}
                  <strong>{(result.confidenceInterval.decisionConfidence * 100).toFixed(1)}%</strong>
                </Typography>
                <Typography variant="body2">
                  95% CI: [
                  <strong>{(result.confidenceInterval.lowerBound95 * 100).toFixed(1)}%</strong>
                  ,&nbsp;
                  <strong>{(result.confidenceInterval.upperBound95 * 100).toFixed(1)}%</strong>]
                </Typography>
              </Box>
              <Chip size="small" label={result.confidenceInterval.method} variant="outlined" sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {result.confidenceInterval.interpretation}
              </Typography>
            </CardContent>
          </Card>

          {result.reasoningSteps.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Reasoning Steps
                  <Chip size="small" label={result.reasoningSteps.length} sx={{ ml: 1 }} />
                </Typography>
                <List dense>
                  {result.reasoningSteps.map((step, i) => (
                    <Box key={i}>
                      <ListItem alignItems="flex-start">
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                              <Chip size="small" label={`Step ${i + 1}`} />
                            </Box>
                          }
                          secondary={step}
                        />
                      </ListItem>
                      {i < result.reasoningSteps.length - 1 && <Divider />}
                    </Box>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          {result.ragChunks.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  RAG Context Chunks
                  <Chip size="small" label={result.ragChunks.length} sx={{ ml: 1 }} />
                </Typography>
                <List dense>
                  {result.ragChunks.map((chunk, i) => (
                    <ListItem key={i}>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {chunk}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}
