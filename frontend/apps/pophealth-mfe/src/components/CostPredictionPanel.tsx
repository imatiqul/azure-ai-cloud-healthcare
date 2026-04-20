import { useState } from 'react';
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
import Slider from '@mui/material/Slider';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;

interface CostPrediction {
  id: string;
  patientId: string;
  predicted12mCostUsd: number;
  lowerBound95Usd: number;
  upperBound95Usd: number;
  costTier: string;
  costDrivers: string[];
  modelVersion: string;
  predictedAt: string;
}

function tierBadgeVariant(tier: string): 'error' | 'warning' | 'success' | 'default' {
  if (tier === 'Critical' || tier === 'High') return 'error';
  if (tier === 'Medium') return 'warning';
  return 'success';
}

function tierChipColor(tier: string): 'error' | 'warning' | 'success' | 'default' {
  if (tier === 'Critical' || tier === 'High') return 'error';
  if (tier === 'Medium') return 'warning';
  return 'success';
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function CostPredictionPanel() {
  const [patientId, setPatientId] = useState('');
  const [riskLevel, setRiskLevel] = useState<string>('Medium');
  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionInput, setConditionInput] = useState('');
  const [sdohWeight, setSdohWeight] = useState(0);
  const [prediction, setPrediction] = useState<CostPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addCondition = () => {
    const trimmed = conditionInput.trim();
    if (trimmed && !conditions.includes(trimmed)) {
      setConditions(prev => [...prev, trimmed]);
      setConditionInput('');
    }
  };

  const handleSubmit = async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/population-health/cost-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patientId.trim(),
          riskLevel,
          conditions,
          sdohWeight,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrediction(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to predict cost');
    } finally {
      setLoading(false);
    }
  };

  const fetchLatest = async () => {
    if (!patientId.trim()) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/population-health/cost-prediction/${encodeURIComponent(patientId.trim())}`,
      );
      if (res.ok) setPrediction(await res.json());
    } catch {
      // silent — best effort load
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardHeader>
          <CardTitle>Healthcare Cost Prediction</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <TextField
              label="Patient ID"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Risk Level</InputLabel>
              <Select
                label="Risk Level"
                value={riskLevel}
                onChange={e => setRiskLevel(e.target.value)}
              >
                {RISK_LEVELS.map(l => (
                  <MenuItem key={l} value={l}>
                    {l}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Conditions
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {conditions.map(c => (
                <Chip
                  key={c}
                  label={c}
                  onDelete={() => setConditions(prev => prev.filter(x => x !== c))}
                  size="small"
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Add condition"
                value={conditionInput}
                onChange={e => setConditionInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCondition()}
                size="small"
                sx={{ flexGrow: 1 }}
                placeholder="e.g. Hypertension"
              />
              <Button variant="outline" onClick={addCondition}>
                Add
              </Button>
            </Box>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              SDOH Weight: {sdohWeight.toFixed(2)}{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                (0 = auto-resolve from latest SDOH assessment)
              </Typography>
            </Typography>
            <Slider
              value={sdohWeight}
              onChange={(_, v) => setSdohWeight(v as number)}
              min={0}
              max={1}
              step={0.05}
              marks={[
                { value: 0, label: '0' },
                { value: 0.5, label: '0.5' },
                { value: 1, label: '1' },
              ]}
              aria-label="SDOH weight"
            />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={handleSubmit} disabled={!patientId.trim() || loading}>
              {loading ? 'Predicting…' : 'Predict Cost'}
            </Button>
            <Button variant="outline" onClick={fetchLatest} disabled={!patientId.trim()}>
              Load Latest
            </Button>
          </Box>
        </CardContent>
      </Card>

      {prediction && (
        <Card>
          <CardHeader>
            <CardTitle>Cost Estimate — Patient {prediction.patientId}</CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label={`Predicted: ${formatUsd(prediction.predicted12mCostUsd)}`}
                color="primary"
              />
              <Chip
                label={`Tier: ${prediction.costTier}`}
                color={tierChipColor(prediction.costTier)}
              />
              <Chip label={`Model: ${prediction.modelVersion}`} variant="outlined" />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              95% confidence interval:{' '}
              <strong>{formatUsd(prediction.lowerBound95Usd)}</strong> —{' '}
              <strong>{formatUsd(prediction.upperBound95Usd)}</strong>
            </Typography>

            {prediction.costDrivers.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Cost Drivers
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {prediction.costDrivers.map(d => (
                    <Badge key={d} variant="default">
                      {d}
                    </Badge>
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
