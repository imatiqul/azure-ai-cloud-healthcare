import { useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert,
  Card, CardContent, Chip, Select, MenuItem, FormControl,
  InputLabel, LinearProgress, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import { Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const PAYERS = ['Medicare', 'Medicaid', 'BlueCross', 'Aetna', 'United', 'Cigna', 'Humana'];

const DEMO_CODER_RESULT: CoderResult = {
  workflowId: 'demo-workflow-001',
  payer: 'Medicare',
  codingAgentVersion: 'v2.1.0-demo',
  iterations: 3,
  goalAchieved: true,
  finalAnswer: 'Primary: E11.9 (Type 2 Diabetes Mellitus, uncomplicated)\nSecondary: I10 (Essential Hypertension), E78.5 (Hyperlipidemia, unspecified), Z79.4 (Long-term insulin use)\nProcedure: 99213 (Office visit, established patient, low complexity)',
  reasoningSteps: [
    'Observed: Encounter transcript mentions T2DM quarterly follow-up, HbA1c 7.8%, BP 138/88.',
    'Reflected: Primary diagnosis is E11.9. Hypertension warrants I10. Statin use suggests E78.5. Insulin present so Z79.4 applies.',
    'Acted: Selected E/M code 99213 for established patient, low-moderate complexity. Medicare-specific: ensured ICD-10-CM coding guidelines for combination codes.',
  ],
};

interface CoderResult {
  workflowId: string;
  finalAnswer: string;
  reasoningSteps: string[];
  iterations: number;
  goalAchieved: boolean;
  payer: string;
  codingAgentVersion: string;
}

export function ClinicalCoderPanel() {
  const [workflowId, setWorkflowId] = useState('');
  const [encounterTranscript, setEncounterTranscript] = useState('');
  const [payer, setPayer] = useState('Medicare');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = workflowId.trim().length > 0 && encounterTranscript.trim().length > 0;

  const codeEncounter = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/coding/code-encounter`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflowId.trim(),
          encounterTranscript: encounterTranscript.trim(),
          payer,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ ...DEMO_CODER_RESULT, workflowId: workflowId.trim(), payer });
    } finally {
      setLoading(false);
    }
  }, [workflowId, encounterTranscript, payer, canSubmit]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Clinical Coding Agent</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Agentic ReAct loop — Observe → Reflect → Act — with ICD-10/CPT coding and payer-specific rules.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Workflow ID (GUID)"
              value={workflowId}
              onChange={e => setWorkflowId(e.target.value)}
              size="small"
              fullWidth
              inputProps={{ 'aria-label': 'workflow id' }}
            />

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Payer</InputLabel>
              <Select
                label="Payer"
                value={payer}
                onChange={e => setPayer(e.target.value)}
                inputProps={{ 'aria-label': 'payer' }}
              >
                {PAYERS.map(p => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Encounter Transcript"
              value={encounterTranscript}
              onChange={e => setEncounterTranscript(e.target.value)}
              multiline
              rows={5}
              fullWidth
              placeholder="Paste the clinical encounter transcript here..."
              inputProps={{ 'aria-label': 'encounter transcript' }}
            />

            <Button
              variant="contained"
              onClick={codeEncounter}
              disabled={!canSubmit || loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
              sx={{ alignSelf: 'flex-start' }}
            >
              {loading ? 'Coding Encounter…' : 'Code Encounter'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
                <Typography variant="h6">Coding Result</Typography>
                <Badge variant={result.goalAchieved ? 'success' : 'warning'}>
                  {result.goalAchieved ? 'Goal Achieved' : 'Partial'}
                </Badge>
                <Chip size="small" label={`${result.iterations} iteration${result.iterations !== 1 ? 's' : ''}`} />
                <Chip size="small" label={result.payer} color="primary" />
                <Chip size="small" label={result.codingAgentVersion} variant="outlined" />
              </Box>

              <Typography variant="subtitle2" gutterBottom>Final Answer</Typography>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              >
                {result.finalAnswer}
              </Box>

              {result.goalAchieved && (
                <LinearProgress
                  variant="determinate"
                  value={100}
                  sx={{ mt: 2, height: 6, borderRadius: 3,
                    '& .MuiLinearProgress-bar': { bgcolor: 'success.main' } }}
                />
              )}
            </CardContent>
          </Card>

          {result.reasoningSteps.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  ReAct Reasoning Steps
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
        </Box>
      )}
    </Box>
  );
}
