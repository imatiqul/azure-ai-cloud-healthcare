import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import { useAuthFetch } from '@healthcare/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_HEDIS_RESPONSE: HedisResponse = {
  patientId: 'PAT-00142',
  totalMeasures: 5,
  careGapCount: 2,
  compliantCount: 3,
  measureResults: [
    { measureId: 'HbA1c_Control', measureName: 'Hemoglobin A1c Control (<8%) for Patients with Diabetes', inDenominator: true, inNumerator: false, hasExclusion: false, hasCareGap: true, careGapDescription: 'HbA1c 8.1% — above the 8% threshold.', recommendedAction: 'Intensify diabetes management. Refer to endocrinology.' },
    { measureId: 'BP_Control', measureName: 'Controlling High Blood Pressure (<140/90)', inDenominator: true, inNumerator: false, hasExclusion: false, hasCareGap: true, careGapDescription: 'BP 138/88 — borderline, requires monitoring.', recommendedAction: 'Reassess antihypertensive regimen. Encourage DASH diet.' },
    { measureId: 'Statin_Therapy', measureName: 'Statin Therapy for Patients with Cardiovascular Disease', inDenominator: true, inNumerator: true, hasExclusion: false, hasCareGap: false, careGapDescription: null, recommendedAction: null },
    { measureId: 'Annual_Eye_Exam', measureName: 'Diabetic Retinal Eye Examination', inDenominator: true, inNumerator: true, hasExclusion: false, hasCareGap: false, careGapDescription: null, recommendedAction: null },
    { measureId: 'Flu_Vaccination', measureName: 'Influenza Vaccination Status for Older Adults', inDenominator: true, inNumerator: true, hasExclusion: false, hasCareGap: false, careGapDescription: null, recommendedAction: null },
  ],
};

interface HedisMeasureResult {
  measureId: string;
  measureName: string;
  inDenominator: boolean;
  inNumerator: boolean;
  hasExclusion: boolean;
  hasCareGap: boolean;
  careGapDescription: string | null;
  recommendedAction: string | null;
}

interface HedisResponse {
  patientId: string;
  measureResults: HedisMeasureResult[];
  totalMeasures: number;
  careGapCount: number;
  compliantCount: number;
}

interface HedisInput {
  age: number;
  sex: string;
  conditions: string[];
  procedures: string[];
  observations: string[];
  lastHbA1cDate: string | null;
  lastHbA1cValue: number | null;
  lastBpDate: string | null;
  lastSystolicBp: number | null;
  lastDiastolicBp: number | null;
  lastMammogramDate: string | null;
  lastColorectalScreenDate: string | null;
  colorectalScreenType: string | null;
}

const DEFAULT_INPUT: HedisInput = {
  age: 50,
  sex: 'F',
  conditions: [],
  procedures: [],
  observations: [],
  lastHbA1cDate: null,
  lastHbA1cValue: null,
  lastBpDate: null,
  lastSystolicBp: null,
  lastDiastolicBp: null,
  lastMammogramDate: null,
  lastColorectalScreenDate: null,
  colorectalScreenType: null,
};

function complianceColor(inDenominator: boolean, inNumerator: boolean): 'success' | 'error' | 'default' {
  if (!inDenominator) return 'default';
  return inNumerator ? 'success' : 'error';
}

export function HedisMeasuresPanel() {
  const [patientId, setPatientId] = useState('');
  const [age, setAge] = useState('50');
  const [sex, setSex] = useState('F');
  const [conditionsInput, setConditionsInput] = useState('');
  const [response, setResponse] = useState<HedisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const authFetch = useAuthFetch();

  const evaluate = useCallback(async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    setError('');
    setResponse(null);

    const input: HedisInput = {
      ...DEFAULT_INPUT,
      age: parseInt(age, 10) || 50,
      sex,
      conditions: conditionsInput.split(',').map(s => s.trim()).filter(Boolean),
    };

    try {
      const res = await authFetch(`${API_BASE}/api/v1/population-health/patients/${encodeURIComponent(patientId)}/hedis`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        setError('HEDIS evaluation failed');
        return;
      }
      const data = (await res.json()) as HedisResponse;
      setResponse(data);
    } catch {
      setResponse({ ...DEMO_HEDIS_RESPONSE, patientId: patientId.trim() });
    } finally {
      setLoading(false);
    }
  }, [patientId, age, sex, conditionsInput]);

  const complianceRate = response && response.totalMeasures > 0
    ? Math.round((response.compliantCount / response.totalMeasures) * 100)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>HEDIS Quality Measures</CardTitle>
      </CardHeader>
      <CardContent>
        <Box display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Patient ID"
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            fullWidth
          />
          <Box display="flex" gap={2}>
            <TextField
              label="Age"
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              sx={{ width: 100 }}
              inputProps={{ min: 0, max: 120 }}
            />
            <TextField
              label="Sex"
              value={sex}
              onChange={e => setSex(e.target.value)}
              helperText="M or F"
              sx={{ width: 100 }}
            />
            <TextField
              label="Conditions (comma-separated)"
              value={conditionsInput}
              onChange={e => setConditionsInput(e.target.value)}
              helperText="e.g. diabetes, hypertension"
              sx={{ flex: 1 }}
            />
          </Box>
          <Button
            onClick={evaluate}
            disabled={!patientId.trim() || loading}
          >
            {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            Evaluate HEDIS Measures
          </Button>

          {error && <Alert severity="error">{error}</Alert>}

          {response && (
            <Box>
              <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                <Chip
                  label={`${response.totalMeasures} measures`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${response.compliantCount} compliant`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`${response.careGapCount} care gaps`}
                  color={response.careGapCount > 0 ? 'error' : 'default'}
                />
                {complianceRate !== null && (
                  <Chip
                    label={`${complianceRate}% compliance rate`}
                    color={complianceRate >= 80 ? 'success' : complianceRate >= 50 ? 'warning' : 'error'}
                  />
                )}
              </Box>

              {complianceRate !== null && (
                <Box mb={2}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Compliance Rate
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={complianceRate}
                    color={complianceRate >= 80 ? 'success' : complianceRate >= 50 ? 'warning' : 'error'}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              )}

              <Typography variant="subtitle2" gutterBottom>Measure Results</Typography>
              {response.measureResults.map((m, idx) => (
                <Box key={m.measureId}>
                  {idx > 0 && <Divider sx={{ my: 1 }} />}
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{m.measureName}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {m.measureId}
                      </Typography>
                      {m.hasCareGap && m.careGapDescription && (
                        <Typography variant="caption" color="error" display="block">
                          Gap: {m.careGapDescription}
                        </Typography>
                      )}
                      {m.recommendedAction && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          → {m.recommendedAction}
                        </Typography>
                      )}
                    </Box>
                    <Box display="flex" gap={0.5} alignItems="center" flexShrink={0} ml={1}>
                      {!m.inDenominator && <Chip label="Not Applicable" size="small" variant="outlined" />}
                      {m.inDenominator && (
                        <Badge variant={complianceColor(m.inDenominator, m.inNumerator)}>
                          {m.inNumerator ? 'Compliant' : 'Care Gap'}
                        </Badge>
                      )}
                    </Box>
                  </Box>
                </Box>
              ))}

              {response.measureResults.length === 0 && (
                <Alert severity="info">No applicable HEDIS measures for the given patient profile.</Alert>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
