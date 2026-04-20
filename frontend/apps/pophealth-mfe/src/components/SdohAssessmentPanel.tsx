import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DOMAINS = [
  'HousingInstability',
  'FoodInsecurity',
  'Transportation',
  'SocialIsolation',
  'FinancialStrain',
  'Employment',
  'Education',
  'DigitalAccess',
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  HousingInstability: 'Housing Instability',
  FoodInsecurity: 'Food Insecurity',
  Transportation: 'Transportation',
  SocialIsolation: 'Social Isolation',
  FinancialStrain: 'Financial Strain',
  Employment: 'Employment',
  Education: 'Education',
  DigitalAccess: 'Digital Access',
};

const SCORE_OPTIONS = [
  { value: 0, label: 'None (0)' },
  { value: 1, label: 'Mild (1)' },
  { value: 2, label: 'Moderate (2)' },
  { value: 3, label: 'Severe (3)' },
];

interface SdohResult {
  id: string;
  patientId: string;
  totalScore: number;
  riskLevel: string;
  compositeRiskWeight: number;
  domainScores: Record<string, number>;
  prioritizedNeeds: string[];
  recommendedActions: string[];
  assessedAt: string;
}

function riskBadgeVariant(level: string): 'error' | 'warning' | 'success' {
  if (level === 'High') return 'error';
  if (level === 'Moderate') return 'warning';
  return 'success';
}

function riskChipColor(level: string): 'error' | 'warning' | 'success' {
  if (level === 'High') return 'error';
  if (level === 'Moderate') return 'warning';
  return 'success';
}

export function SdohAssessmentPanel() {
  const [patientId, setPatientId] = useState('');
  const [domainScores, setDomainScores] = useState<Record<string, number>>(
    () => Object.fromEntries(DOMAINS.map(d => [d, 0])),
  );
  const [assessedBy, setAssessedBy] = useState('');
  const [result, setResult] = useState<SdohResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLatest = useCallback(async (pid: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/population-health/sdoh/${encodeURIComponent(pid)}`,
      );
      if (res.ok) setResult(await res.json());
    } catch {
      // ignore — GET is best-effort on load
    }
  }, []);

  const handleSubmit = async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/population-health/sdoh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patientId.trim(),
          domainScores,
          assessedBy: assessedBy.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit assessment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardHeader>
          <CardTitle>SDOH Screening Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <TextField
              label="Patient ID"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Assessed By (optional)"
              value={assessedBy}
              onChange={e => setAssessedBy(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 2,
              mb: 2,
            }}
          >
            {DOMAINS.map(domain => (
              <FormControl fullWidth size="small" key={domain}>
                <InputLabel>{DOMAIN_LABELS[domain]}</InputLabel>
                <Select
                  label={DOMAIN_LABELS[domain]}
                  value={domainScores[domain]}
                  onChange={e =>
                    setDomainScores(prev => ({ ...prev, [domain]: Number(e.target.value) }))
                  }
                >
                  {SCORE_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={handleSubmit} disabled={!patientId.trim() || loading}>
              {loading ? 'Submitting…' : 'Submit Assessment'}
            </Button>
            {patientId.trim() && (
              <Button variant="outline" onClick={() => fetchLatest(patientId.trim())}>
                Load Latest
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment Results — Patient {result.patientId}</CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`Total Score: ${result.totalScore}/24`} color="primary" />
              <Chip
                label={`Risk: ${result.riskLevel}`}
                color={riskChipColor(result.riskLevel)}
              />
              <Chip
                label={`Risk Weight: ${(result.compositeRiskWeight * 100).toFixed(0)}%`}
                variant="outlined"
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Score progress ({result.totalScore}/24)
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(result.totalScore / 24) * 100}
                color={riskChipColor(result.riskLevel)}
                sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
              />
            </Box>

            {result.prioritizedNeeds.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Prioritized Needs
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {result.prioritizedNeeds.map(need => (
                    <Badge key={need} variant="warning">
                      {DOMAIN_LABELS[need] ?? need}
                    </Badge>
                  ))}
                </Box>
              </Box>
            )}

            {result.recommendedActions.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Recommended Actions
                </Typography>
                {result.recommendedActions.map((action, i) => (
                  <Typography key={i} variant="body2">
                    • {action}
                  </Typography>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
