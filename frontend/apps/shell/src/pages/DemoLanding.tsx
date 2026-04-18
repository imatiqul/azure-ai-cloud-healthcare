import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEMO_API = `${API_BASE}/api/v1/agents/demo`;

interface DemoStartResponse {
  sessionId: string;
  guideSessionId: string;
  currentStep: string;
  narration: string;
  stepInfo: StepInfo | null;
}

interface StepInfo {
  step: string;
  title: string;
  feedbackQuestion: string;
  feedbackTags: string[];
}

export default function DemoLanding() {
  const navigate = useNavigate();
  const [clientName, setClientName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!clientName.trim() || !company.trim()) {
      setError('Please enter your name and company.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${DEMO_API}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, company, email: email || null }),
      });
      if (!res.ok) throw new Error('Failed to start demo');
      const data: DemoStartResponse = await res.json();
      // Store demo state and navigate to main app in demo mode
      sessionStorage.setItem('demo', JSON.stringify({
        sessionId: data.sessionId,
        guideSessionId: data.guideSessionId,
        currentStep: data.currentStep,
        narration: data.narration,
        stepInfo: data.stepInfo,
        clientName,
        company,
      }));
      navigate('/demo/live');
    } catch {
      setError('Could not start the demo. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
      p: 2,
    }}>
      <Card sx={{ maxWidth: 520, width: '100%', borderRadius: 3, boxShadow: 8 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <SmartToyIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            HealthQ Copilot
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
            AI-Powered Healthcare Platform — Interactive Demo
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'left' }}>
            Experience our end-to-end clinical workflow: Voice Intake → AI Triage → Scheduling → Revenue Cycle → Population Health.
            Our AI copilot will guide you through each module.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth
            label="Your Name"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Company"
            value={company}
            onChange={e => setCompany(e.target.value)}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Email (optional)"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            sx={{ mb: 3 }}
          />

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleStart}
            disabled={loading}
            startIcon={<PlayArrowIcon />}
            sx={{ py: 1.5, fontSize: '1.1rem' }}
          >
            {loading ? 'Starting Demo...' : 'Start Interactive Demo'}
          </Button>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            No sign-up required • 5-minute guided tour • Provide feedback at each step
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
