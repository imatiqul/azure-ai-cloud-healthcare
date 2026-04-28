import { useState, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface RegisteredModel {
  id: string;
  modelName: string;
  modelVersion: string;
  deploymentName: string;
  deployedAt: string;
  isActive: boolean;
}

interface ModelDetail {
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

interface RegisterForm {
  modelName: string;
  modelVersion: string;
  deploymentName: string;
  skVersion: string;
  promptHash: string;
  deployedByUserId: string;
}

function scoreColor(score: number): string {
  if (score >= 0.85) return '#4caf50';
  if (score >= 0.70) return '#ff9800';
  return '#f44336';
}

export default function ModelRegisterPanel() {
  const [form, setForm] = useState<RegisterForm>({
    modelName: '',
    modelVersion: '',
    deploymentName: '',
    skVersion: '',
    promptHash: '',
    deployedByUserId: '',
  });
  const [registered, setRegistered] = useState<RegisteredModel | null>(null);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const [lookupId, setLookupId] = useState('');
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookError, setLookError] = useState<string | null>(null);

  const canRegister =
    form.modelName.trim() &&
    form.modelVersion.trim() &&
    form.deploymentName.trim() &&
    form.deployedByUserId.trim();

  const registerModel = useCallback(async () => {
    setRegistering(true);
    setRegError(null);
    setRegistered(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/governance/register`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RegisteredModel = await res.json();
      setRegistered(data);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }, [form]);

  const lookupModel = useCallback(async () => {
    if (!lookupId.trim()) return;
    setLooking(true);
    setLookError(null);
    setDetail(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/agents/governance/${encodeURIComponent(lookupId.trim())}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ModelDetail = await res.json();
      setDetail(data);
    } catch (err) {
      setLookError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLooking(false);
    }
  }, [lookupId]);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        Model Registry
      </Typography>

      {/* Register Card */}
      <Card>
        <CardHeader><CardTitle>Register New Model Deployment</CardTitle></CardHeader>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Model Name"
                fullWidth
                required
                placeholder="gpt-4o"
                value={form.modelName}
                onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Model Version"
                fullWidth
                required
                placeholder="2024-11-20"
                value={form.modelVersion}
                onChange={(e) => setForm((f) => ({ ...f, modelVersion: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Deployment Name"
                fullWidth
                required
                placeholder="healthq-gpt4o-prod"
                value={form.deploymentName}
                onChange={(e) => setForm((f) => ({ ...f, deploymentName: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="SK Version"
                fullWidth
                placeholder="1.30.0"
                value={form.skVersion}
                onChange={(e) => setForm((f) => ({ ...f, skVersion: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Prompt Hash (SHA-256)"
                fullWidth
                placeholder="sha256:abc123..."
                value={form.promptHash}
                onChange={(e) => setForm((f) => ({ ...f, promptHash: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Deployed By User ID"
                fullWidth
                required
                value={form.deployedByUserId}
                onChange={(e) => setForm((f) => ({ ...f, deployedByUserId: e.target.value }))}
              />
            </Grid>
          </Grid>

          {regError && <Alert severity="error" sx={{ mt: 2 }}>{regError}</Alert>}

          {registered && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={600}>
                  Model registered: {registered.modelName} v{registered.modelVersion}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip label={registered.deploymentName} size="small" />
                  <Badge color={registered.isActive ? 'success' : 'default'}>
                    {registered.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </Stack>
                <Typography variant="caption" fontFamily="monospace">ID: {registered.id}</Typography>
              </Stack>
            </Alert>
          )}

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={registerModel} disabled={!canRegister || registering}>
              {registering ? <CircularProgress size={16} /> : 'Register Model'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Lookup Card */}
      <Card>
        <CardHeader><CardTitle>Lookup Registry Entry by ID</CardTitle></CardHeader>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-end">
            <TextField
              label="Registry Entry ID (GUID)"
              size="small"
              sx={{ flex: 1 }}
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              inputProps={{ 'aria-label': 'registry entry id' }}
            />
            <Button onClick={lookupModel} disabled={!lookupId.trim() || looking}>
              {looking ? <CircularProgress size={16} /> : 'Lookup'}
            </Button>
          </Stack>

          {lookError && <Alert severity="error" sx={{ mt: 2 }}>{lookError}</Alert>}

          {detail && (
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1" fontWeight={700}>{detail.modelName}</Typography>
                <Chip label={`v${detail.modelVersion}`} size="small" />
                <Badge color={detail.isActive ? 'success' : 'default'}>
                  {detail.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Typography variant="body2"><strong>Deployment:</strong> {detail.deploymentName}</Typography>
                <Typography variant="body2"><strong>SK Version:</strong> {detail.skVersion || '—'}</Typography>
                <Typography variant="body2">
                  <strong>Deployed:</strong> {new Date(detail.deployedAt).toLocaleString()}
                </Typography>
              </Stack>
              {detail.promptHash && (
                <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                  Hash: {detail.promptHash}
                </Typography>
              )}
              {detail.lastEvalScore !== null && detail.lastEvalScore !== undefined && (
                <Stack spacing={0.5}>
                  <Typography variant="caption" color="text.secondary">Last Eval Score</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LinearProgress
                      variant="determinate"
                      value={Math.round(detail.lastEvalScore * 100)}
                      sx={{
                        flex: 1,
                        height: 8,
                        borderRadius: 4,
                        '& .MuiLinearProgress-bar': { backgroundColor: scoreColor(detail.lastEvalScore) },
                      }}
                    />
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color={scoreColor(detail.lastEvalScore)}
                    >
                      {Math.round(detail.lastEvalScore * 100)}%
                    </Typography>
                  </Stack>
                </Stack>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
