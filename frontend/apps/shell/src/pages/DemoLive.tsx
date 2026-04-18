import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { OverallFeedbackDialog } from '../components/OverallFeedbackDialog';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEMO_API = `${API_BASE}/api/v1/agents/demo`;

const STEP_LABELS = [
  'Welcome',
  'Voice Intake',
  'AI Triage',
  'Scheduling',
  'Revenue Cycle',
  'Population Health',
];

const STEP_ROUTES: Record<string, string> = {
  Welcome: '/',
  VoiceIntake: '/voice',
  AiTriage: '/triage',
  Scheduling: '/scheduling',
  RevenueCycle: '/revenue',
  PopulationHealth: '/population-health',
};

interface StepInfo {
  step: string;
  title: string;
  feedbackQuestion: string;
  feedbackTags: string[];
}

interface DemoState {
  sessionId: string;
  guideSessionId: string;
  currentStep: string;
  narration: string;
  stepInfo: StepInfo | null;
  clientName: string;
  company: string;
}

export default function DemoLive() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [narration, setNarration] = useState('');
  const [stepInfo, setStepInfo] = useState<StepInfo | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showOverall, setShowOverall] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('demo');
    if (!stored) {
      navigate('/demo');
      return;
    }
    const state: DemoState = JSON.parse(stored);
    setDemo(state);
    setNarration(state.narration);
    setStepInfo(state.stepInfo);
  }, [navigate]);

  const advanceStep = useCallback(async () => {
    if (!demo) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${DEMO_API}/${demo.sessionId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to advance step');
      const data = await res.json();

      if (data.isComplete) {
        setShowOverall(true);
        setNarration(data.narration);
      } else {
        const newStep = STEP_LABELS.indexOf(data.stepInfo?.title?.replace(' Demo', '') ?? '') + 1;
        setActiveStep(newStep > 0 ? newStep : activeStep + 1);
        setNarration(data.narration);
        setStepInfo(data.stepInfo);
      }
    } catch {
      setError('Could not advance. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [demo, activeStep]);

  const submitFeedback = useCallback(async (rating: number, tags: string[], comment: string) => {
    if (!demo || !stepInfo) return;
    setShowFeedback(false);
    try {
      await fetch(`${DEMO_API}/${demo.sessionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepInfo.step, rating, tags, comment }),
      });
    } catch {
      // Non-critical — continue the demo
    }
    await advanceStep();
  }, [demo, stepInfo, advanceStep]);

  const skipFeedback = useCallback(async () => {
    setShowFeedback(false);
    await advanceStep();
  }, [advanceStep]);

  const completeDemo = useCallback(async (nps: number, priorities: string[], comment: string) => {
    if (!demo) return;
    setShowOverall(false);
    try {
      await fetch(`${DEMO_API}/${demo.sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npsScore: nps, featurePriorities: priorities, comment }),
      });
      setCompleted(true);
      sessionStorage.removeItem('demo');
    } catch {
      setError('Could not submit final feedback.');
    }
  }, [demo]);

  if (!demo) return null;

  if (completed) {
    return (
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}>
        <Card sx={{ maxWidth: 500, textAlign: 'center', p: 3, borderRadius: 3, boxShadow: 6 }}>
          <CardContent>
            <CheckCircleIcon sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
            <Typography variant="h4" fontWeight="bold" gutterBottom>Demo Complete!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Thank you, {demo.clientName}! Your feedback helps us build a better platform.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/demo')}>
              Start Another Demo
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Progress bar */}
      <Paper elevation={2} sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <SmartToyIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>
            HealthQ Copilot Demo — {demo.clientName} ({demo.company})
          </Typography>
          <Chip label={`Step ${activeStep + 1} of 6`} color="primary" size="small" />
        </Box>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEP_LABELS.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <LinearProgress
          variant="determinate"
          value={((activeStep + 1) / 6) * 100}
          sx={{ mt: 1, height: 6, borderRadius: 3 }}
        />
      </Paper>

      {/* Main content area */}
      <Box sx={{ flex: 1, p: 3, maxWidth: 900, mx: 'auto', width: '100%' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* AI Narration card */}
        <Card sx={{ mb: 3, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <SmartToyIcon color="primary" sx={{ mt: 0.5 }} />
              <Box>
                <Typography variant="subtitle2" color="primary.main" gutterBottom>
                  AI Copilot Narration
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {narration}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Navigation hint */}
        {stepInfo && STEP_ROUTES[stepInfo.step] && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <strong>Explore this module:</strong> In a full deployment, this step would navigate to{' '}
            <strong>{STEP_ROUTES[stepInfo.step]}</strong> to see the live feature.
          </Alert>
        )}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            endIcon={<NavigateNextIcon />}
            onClick={() => setShowFeedback(true)}
            disabled={loading}
            sx={{ px: 4 }}
          >
            {loading ? 'Loading...' : 'Rate & Continue'}
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={advanceStep}
            disabled={loading}
          >
            Skip to Next
          </Button>
        </Box>
      </Box>

      {/* Feedback dialogs */}
      {stepInfo && (
        <FeedbackDialog
          open={showFeedback}
          question={stepInfo.feedbackQuestion}
          tags={stepInfo.feedbackTags}
          onSubmit={submitFeedback}
          onSkip={skipFeedback}
        />
      )}
      <OverallFeedbackDialog
        open={showOverall}
        onSubmit={completeDemo}
      />
    </Box>
  );
}
