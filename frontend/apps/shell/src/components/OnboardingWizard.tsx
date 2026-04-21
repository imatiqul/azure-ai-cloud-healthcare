/**
 * OnboardingWizard — first-run modal stepper that guides new users through
 * the five key areas of HealthQ Copilot.  Shown once per major release
 * (keyed by ONBOARDING_KEY); dismissed state persisted to localStorage.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MobileStepper from '@mui/material/MobileStepper';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

// ── Storage key ───────────────────────────────────────────────────────────────

export const ONBOARDING_KEY = 'hq:onboarded-v38';

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'done';
}

export function markOnboardingComplete(): void {
  localStorage.setItem(ONBOARDING_KEY, 'done');
}

// ── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  title:       string;
  subtitle:    string;
  description: string;
  icon:        React.ReactNode;
  action?:     { label: string; href: string };
  color:       string;
}

const STEPS: Step[] = [
  {
    title:       'Welcome to HealthQ Copilot',
    subtitle:    'Your AI-powered healthcare command centre',
    description: "HealthQ Copilot unifies clinical intelligence, operational analytics, and AI-assisted triage in a single platform. This short walkthrough highlights the features you'll use most.",
    icon:        <HealthAndSafetyIcon sx={{ fontSize: 64 }} />,
    color:       'primary.main',
  },
  {
    title:       'AI-Powered Clinical Triage',
    subtitle:    'Voice → Transcript → AI decision in seconds',
    description: 'Start a Voice Session to capture patient encounters. The AI triage engine assigns urgency levels (P1–P4), suggests ICD-10 codes, and flags items for human review — all without manual data entry.',
    icon:        <SmartToyIcon sx={{ fontSize: 64 }} />,
    action:      { label: 'Go to Triage', href: '/triage' },
    color:       'secondary.main',
  },
  {
    title:       'Population Health & Analytics',
    subtitle:    'HEDIS, SDOH, risk trajectories',
    description: 'Track patient populations with SDOH screening, readmission risk scoring, HEDIS quality measures, and 12-month cost predictions. Spot at-risk patients before costly readmissions occur.',
    icon:        <TrendingUpIcon sx={{ fontSize: 64 }} />,
    action:      { label: 'View Analytics', href: '/population-health' },
    color:       'success.main',
  },
  {
    title:       'Revenue Cycle & Denials',
    subtitle:    'EDI 837/835, prior auth, denial management',
    description: 'The AI clinical coding agent auto-codes encounters using ICD-10 and CPT codes. Track claim denials with appeal deadlines, prior authorisation statuses, and overturn analytics from one view.',
    icon:        <AttachMoneyIcon sx={{ fontSize: 64 }} />,
    action:      { label: 'Open Revenue', href: '/revenue' },
    color:       'warning.main',
  },
  {
    title:       "You're all set!",
    subtitle:    'Explore at your own pace',
    description: 'Press the ? button in the top bar for page-specific tips. Ctrl+K opens the command palette from anywhere. Star pages in the sidebar to pin them to your Dashboard.',
    icon:        <CheckCircleOutlineIcon sx={{ fontSize: 64 }} />,
    action:      { label: 'Get Started', href: '/' },
    color:       'info.main',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const navigate  = useNavigate();
  const [open,    setOpen]    = useState(false);
  const [step,    setStep]    = useState(0);
  const [skipFuture, setSkipFuture] = useState(false);

  // Show once on first visit (when key is absent)
  useEffect(() => {
    if (!isOnboardingComplete()) {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;

  function dismiss() {
    if (skipFuture) markOnboardingComplete();
    setOpen(false);
  }

  function handleNext() {
    if (isLast) {
      markOnboardingComplete();
      setOpen(false);
      navigate('/');
    } else {
      setStep(s => s + 1);
    }
  }

  function handleBack() {
    setStep(s => s - 1);
  }

  function handleActionNav() {
    markOnboardingComplete();
    setOpen(false);
    navigate(current.action!.href);
  }

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      aria-label="Onboarding wizard"
      disableEscapeKeyDown
    >
      <DialogContent sx={{ pb: 1, pt: 4, px: 4 }}>
        {/* Icon */}
        <Box sx={{ textAlign: 'center', mb: 2, color: current.color }}>
          {current.icon}
        </Box>

        {/* Text */}
        <Typography variant="h6" fontWeight={700} textAlign="center" gutterBottom>
          {current.title}
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
          {current.subtitle}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.7 }}>
          {current.description}
        </Typography>

        {/* Optional quick-nav action */}
        {current.action && !isLast && (
          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={handleActionNav}
              aria-label={current.action.label}
            >
              {current.action.label}
            </Button>
          </Box>
        )}
      </DialogContent>

      {/* Stepper dots */}
      <MobileStepper
        variant="dots"
        steps={STEPS.length}
        position="static"
        activeStep={step}
        sx={{ px: 3, pb: 0, bgcolor: 'transparent' }}
        nextButton={<span />}  // rendered below in DialogActions
        backButton={<span />}
      />

      <DialogActions sx={{ px: 3, pb: 3, pt: 1, flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
        {/* Navigation row */}
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Button
            size="small"
            disabled={isFirst}
            onClick={handleBack}
            startIcon={<KeyboardArrowLeftIcon />}
            aria-label="Previous step"
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleNext}
            endIcon={!isLast ? <KeyboardArrowRightIcon /> : undefined}
            aria-label={isLast ? 'Finish onboarding' : 'Next step'}
          >
            {isLast ? 'Get Started' : 'Next'}
          </Button>
        </Stack>

        {/* Skip/dismiss row */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={skipFuture}
                onChange={e => setSkipFuture(e.target.checked)}
                aria-label="Don't show again"
              />
            }
            label={<Typography variant="caption">Don't show again</Typography>}
          />
          <Button
            size="small"
            color="inherit"
            sx={{ color: 'text.secondary' }}
            onClick={dismiss}
            aria-label="Skip onboarding"
          >
            Skip tour
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
