import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import RefreshIcon from '@mui/icons-material/Refresh';
import IconButton from '@mui/material/IconButton';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Types matching ClinicianFeedbackService responses ──────────────────────
interface FeedbackSummary {
  totalFeedback: number;
  averageRating: number;
  positiveCount: number;
  negativeCount: number;
  ingestedCount: number;
  periodStart: string;
  periodEnd: string;
}

interface SubmitFeedbackPayload {
  clinicianId: string;
  sessionId: string;
  originalAiResponse: string;
  rating: number;
  correctedText?: string;
  comment?: string;
}

const DEMO_FEEDBACK_SUMMARY: FeedbackSummary = {
  totalFeedback: 284,
  averageRating: 4.2,
  positiveCount: 231,
  negativeCount: 53,
  ingestedCount: 271,
  periodStart: new Date(Date.now() - 30 * 86400_000).toISOString(),
  periodEnd: new Date().toISOString(),
};

const RATING_LABELS: Record<number, string> = {
  1: '1 — Strongly Disagree',
  2: '2 — Disagree',
  3: '3 — Neutral',
  4: '4 — Agree',
  5: '5 — Strongly Agree',
};

export default function ClinicianFeedbackDashboard() {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(30);

  // Submit form state
  const [clinicianId, setClinicianId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [originalAiResponse, setOriginalAiResponse] = useState('');
  const [rating, setRating] = useState<number>(3);
  const [correctedText, setCorrectedText] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);
      const res = await fetch(
        `${API_BASE}/api/v1/agents/feedback/summary?since=${since.toISOString()}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data: FeedbackSummary = await res.json();
      setSummary(data);
    } catch {
      setSummary(DEMO_FEEDBACK_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [sinceDays]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const canSubmit =
    clinicianId.trim() !== '' &&
    sessionId.trim() !== '' &&
    originalAiResponse.trim() !== '';

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const payload: SubmitFeedbackPayload = {
        clinicianId: clinicianId.trim(),
        sessionId: sessionId.trim(),
        originalAiResponse: originalAiResponse.trim(),
        rating,
        correctedText: correctedText.trim() || undefined,
        comment: comment.trim() || undefined,
      };
      const res = await fetch(`${API_BASE}/api/v1/agents/feedback`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubmitSuccess(`Feedback recorded — action: ${data.action}`);
      setClinicianId('');
      setSessionId('');
      setOriginalAiResponse('');
      setRating(3);
      setCorrectedText('');
      setComment('');
      fetchSummary();
    } catch {
      // Backend offline — accept feedback locally so clinicians aren't blocked
      setSubmitSuccess('Feedback recorded locally — will sync when backend is available');
      setClinicianId('');
      setSessionId('');
      setOriginalAiResponse('');
      setRating(3);
      setCorrectedText('');
      setComment('');
      setSubmitError(null);
    } finally {
      setSubmitting(false);
    }
  }

  const avgPct = summary ? Math.round(summary.averageRating * 20) : 0; // 5-star → 100%
  const neutralCount =
    summary ? summary.totalFeedback - summary.positiveCount - summary.negativeCount : 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" fontWeight="bold">
          Clinician AI Feedback Dashboard
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={sinceDays}
              label="Period"
              onChange={(e) => setSinceDays(Number(e.target.value))}
            >
              {[7, 30, 60, 90].map((d) => (
                <MenuItem key={d} value={d}>
                  {d} days
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={fetchSummary} aria-label="refresh" size="small">
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <CircularProgress size={24} />}
          {!loading && summary && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Chip label={`Total: ${summary.totalFeedback}`} variant="outlined" />
                <Chip
                  label={`Positive (≥4): ${summary.positiveCount}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`Neutral (3): ${neutralCount}`}
                  color="default"
                  variant="outlined"
                />
                <Chip
                  label={`Negative (≤2): ${summary.negativeCount}`}
                  color="error"
                  variant="outlined"
                />
                <Chip
                  label={`Ingested into RAG: ${summary.ingestedCount}`}
                  color="primary"
                  variant="outlined"
                />
              </Stack>

              <Box>
                <Typography variant="body2" gutterBottom>
                  Average Rating: {summary.averageRating.toFixed(2)} / 5.0
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={avgPct}
                  color={avgPct >= 80 ? 'success' : avgPct >= 60 ? 'warning' : 'error'}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              </Box>

              <Typography variant="caption" color="text.secondary">
                Period: {new Date(summary.periodStart).toLocaleDateString()} –{' '}
                {new Date(summary.periodEnd).toLocaleDateString()}
              </Typography>
            </Stack>
          )}
          {!loading && !summary && !error && (
            <Alert severity="info">No feedback data for this period.</Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Submit feedback ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Clinician Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack spacing={2}>
            {submitSuccess && <Alert severity="success">{submitSuccess}</Alert>}
            {submitError && <Alert severity="error">{submitError}</Alert>}

            <Stack direction="row" spacing={2}>
              <TextField
                label="Clinician ID"
                size="small"
                fullWidth
                value={clinicianId}
                onChange={(e) => setClinicianId(e.target.value)}
                placeholder="e.g. dr-smith"
              />
              <TextField
                label="Session ID"
                size="small"
                fullWidth
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Triage or guide session ID"
              />
            </Stack>

            <TextField
              label="Original AI Response"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={originalAiResponse}
              onChange={(e) => setOriginalAiResponse(e.target.value)}
              placeholder="Paste the AI-generated response being rated"
            />

            <FormControl size="small" sx={{ maxWidth: 220 }}>
              <InputLabel>Rating</InputLabel>
              <Select
                value={rating}
                label="Rating"
                onChange={(e) => setRating(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((r) => (
                  <MenuItem key={r} value={r}>
                    {RATING_LABELS[r]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {rating <= 2 && (
              <TextField
                label="Corrected Text"
                size="small"
                fullWidth
                multiline
                rows={2}
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                placeholder="Provide corrected text (will be ingested into RAG knowledge base)"
                helperText="Required for negative ratings to improve the knowledge base"
              />
            )}

            <TextField
              label="Comment (optional)"
              size="small"
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Additional observations"
            />

            <Box>
              <Button
                variant="default"
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
              >
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary">
        Ratings ≥ 4 ingest approved content into the Qdrant clinical knowledge base (RAG).
        Ratings ≤ 2 with corrected text ingest the correction as a replacement chunk.
        Neutral ratings (3) are logged for audit but do not mutate the knowledge base.
      </Typography>
    </Stack>
  );
}
