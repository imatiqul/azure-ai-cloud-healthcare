/**
 * Phase 61 — DemoCompletionOverlay
 *
 * Full-screen celebration modal shown when the AI self-driven demo finishes
 * all 8 workflows (isDemoComplete = true).
 *
 * Includes:
 *  - Demo summary stats (workflows, scenes, AI accuracy)
 *  - NPS 1-10 score collection
 *  - Three CTAs: Replay Demo · Book a Meeting · Exit
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ReplayIcon from '@mui/icons-material/Replay';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useGlobalStore } from '../../store';
import { DEMO_WORKFLOWS, TOTAL_SCENES } from './demoScripts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEMO_API = `${API_BASE}/api/v1/agents/demo`;

// NPS colour and label helpers are used inside the component (not as module constants)
const NPS_LABELS: Record<number, string> = {
  1: 'Very Poor', 2: 'Poor', 3: 'Below Average',
  4: 'Average', 5: 'Fair', 6: 'Good',
  7: 'Very Good', 8: 'Excellent', 9: 'Outstanding', 10: 'World-Class',
};

function npsColor(score: number): string {
  if (score >= 9) return '#2e7d32';
  if (score >= 7) return '#1976d2';
  if (score >= 5) return '#ed6c02';
  return '#d32f2f';
}

export function DemoCompletionOverlay() {
  const { demoClientName, demoCompany, demoWorkflowIndices, exitDemo, startSelfDrivenDemo } = useGlobalStore();
  const [npsScore, setNpsScore]   = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Phase 64 — dynamic stats based on workflows actually demoed
  const workflowsShown = demoWorkflowIndices.length > 0 ? demoWorkflowIndices.length : DEMO_WORKFLOWS.length;
  const scenesShown    = workflowsShown * 3; // 3 scenes per workflow
  const STAT_ROWS = [
    { label: 'Workflows Covered',  value: `${workflowsShown}` },
    { label: 'Scenes Presented',   value: `${scenesShown}` },
    { label: 'AI Triage Accuracy', value: '94%' },
    { label: 'Avg Claim Recovery', value: '68%' },
    { label: 'No-show Reduction',  value: '34%' },
    { label: 'Readmission Drop',   value: '40%' },
  ];

  const handleReplay = () => {
    const name    = demoClientName || 'Guest';
    const company = demoCompany    || 'Demo';
    exitDemo();
    // Brief timeout to let store settle before restarting
    setTimeout(() => startSelfDrivenDemo(name, company), 50);
  };

  const handleSubmit = async () => {
    if (!npsScore) return;
    // Phase 64 — persist NPS to backend best-effort (don't block UI on failure)
    try {
      const stored = sessionStorage.getItem('demo');
      const sessionId: string | null = stored ? JSON.parse(stored).sessionId : null;
      if (sessionId && !sessionId.startsWith('demo-local-')) {
        await fetch(`${DEMO_API}/${sessionId}/complete`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ npsScore, featurePriorities: [], comment: null }),
          signal:  AbortSignal.timeout(5_000),
        });
      }
    } catch { /* best-effort */ }
    setSubmitted(true);
  };

  return (
    <Box
      sx={{
        position:       'fixed',
        inset:          0,
        zIndex:         2100,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        bgcolor:        'rgba(5, 10, 25, 0.92)',
        backdropFilter: 'blur(20px)',
        p:              2,
      }}
    >
      <Box
        sx={{
          maxWidth:     560,
          width:        '100%',
          borderRadius: 4,
          bgcolor:      'rgba(20, 28, 55, 0.97)',
          border:       '1px solid rgba(255,255,255,0.12)',
          boxShadow:    '0 24px 64px rgba(0,0,0,0.7)',
          overflow:     'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p:          3,
            background: 'linear-gradient(135deg, #1565c0 0%, #6a1b9a 100%)',
            textAlign:  'center',
            position:   'relative',
          }}
        >
          <Tooltip title="Exit demo" arrow>
            <Box
              onClick={exitDemo}
              sx={{
                position: 'absolute',
                top:      12,
                right:    12,
                cursor:   'pointer',
                color:    'rgba(255,255,255,0.5)',
                '&:hover': { color: '#fff' },
                display:  'flex',
              }}
            >
              <CloseIcon fontSize="small" />
            </Box>
          </Tooltip>
          <AutoAwesomeIcon sx={{ fontSize: 52, color: '#ffd54f', mb: 1 }} />
          <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', mb: 0.5 }}>
            Demo Complete!
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            {demoClientName
              ? `Thank you, ${demoClientName} from ${demoCompany}!`
              : 'You\'ve experienced the full HealthQ Copilot platform.'}
          </Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          {/* Stats grid */}
          <Box
            sx={{
              display:             'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap:                 1.5,
              mb:                  3,
            }}
          >
            {STAT_ROWS.map(({ label, value }) => (
              <Box
                key={label}
                sx={{
                  textAlign:    'center',
                  p:            1.5,
                  borderRadius: 2,
                  bgcolor:      'rgba(255,255,255,0.04)',
                  border:       '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Typography variant="h5" fontWeight={800} sx={{ color: '#90caf9' }}>
                  {value}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 3 }} />

          {/* NPS */}
          {!submitted ? (
            <>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#fff', mb: 1, textAlign: 'center' }}>
                How likely are you to recommend HealthQ Copilot?
              </Typography>
              <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" mb={1}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <Tooltip key={n} title={NPS_LABELS[n]} arrow placement="top">
                    <Chip
                      label={n}
                      size="small"
                      onClick={() => setNpsScore(n)}
                      sx={{
                        width:   36,
                        height:  36,
                        cursor:  'pointer',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        bgcolor: npsScore === n ? npsColor(n) : 'rgba(255,255,255,0.08)',
                        color:   npsScore === n ? '#fff' : 'rgba(255,255,255,0.55)',
                        border:  npsScore === n ? `2px solid ${npsColor(n)}` : '2px solid transparent',
                        '&:hover': { bgcolor: npsColor(n) + '44' },
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
              {npsScore && (
                <Typography variant="caption" sx={{ color: npsColor(npsScore), textAlign: 'center', display: 'block', mb: 2, fontWeight: 700 }}>
                  {NPS_LABELS[npsScore]}
                </Typography>
              )}
              <Button
                fullWidth
                variant="contained"
                size="small"
                disabled={npsScore === null}
                onClick={handleSubmit}
                sx={{ mb: 2, bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}
              >
                Submit Feedback
              </Button>
            </>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" mb={2}>
              <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 20 }} />
              <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 700 }}>
                Thank you! Your feedback has been recorded.
              </Typography>
            </Stack>
          )}

          {/* CTAs */}
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ReplayIcon />}
                onClick={handleReplay}
                sx={{
                  color:       'rgba(255,255,255,0.8)',
                  borderColor: 'rgba(255,255,255,0.2)',
                  '&:hover':   { borderColor: '#90caf9', color: '#90caf9', bgcolor: 'rgba(144,202,249,0.08)' },
                }}
              >
                Replay Demo
              </Button>
              <Button
                fullWidth
                variant="contained"
                startIcon={<CalendarMonthIcon />}
                href="mailto:hello@healthqcopilot.com?subject=Book%20a%20Meeting%20—%20HealthQ%20Copilot"
                target="_blank"
                sx={{
                  bgcolor:   '#6a1b9a',
                  '&:hover': { bgcolor: '#4a148c' },
                }}
              >
                Book a Meeting
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
