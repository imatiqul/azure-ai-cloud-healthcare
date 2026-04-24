import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import Alert from '@mui/material/Alert';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useGlobalStore } from '../store'; // Phase 58
import { DEMO_WORKFLOWS, getTourDurationSec, DEMO_AUDIENCE_GROUPS, getAudienceGroupIndices } from '../components/AutoDemo/demoScripts'; // Phase 64/68/70

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const DEMO_API = `${API_BASE}/api/v1/agents/demo`;

const PROOF_POINTS = [
  { stat: '94%',  label: 'AI Triage Accuracy' },
  { stat: '34%',  label: 'No-show Reduction' },
  { stat: '68%',  label: 'Claim Recovery Rate' },
  { stat: '~60s', label: 'SOAP Note in Seconds' },
];

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

const LS_KEY       = 'hq-demo-workflows';
const LS_GROUP_KEY = 'hq-demo-audience-group';

export default function DemoLanding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startSelfDrivenDemo, setDemoWorkflowIndices, setDemoAudienceGroup } = useGlobalStore(); // Phase 58 + 64 + 71
  const [clientName, setClientName] = useState('');
  const [company, setCompany]       = useState('');
  const [email, setEmail]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  // Phase 64/65 — workflow selector (restore from localStorage or default all 8)
  const restoreWorkflows = (): number[] => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const arr: unknown = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr as number[];
      }
    } catch { /* ignore */ }
    return [0, 1, 2, 3, 4, 5, 6, 7];
  };
  const [selectedWorkflows, setSelectedWorkflows] = useState<number[]>(restoreWorkflows);
  const [selectedGroup, setSelectedGroup]         = useState<string | null>(
    () => localStorage.getItem(LS_GROUP_KEY) || null,
  );

  // Phase 65 — URL-based pre-fill + optional auto-start
  useEffect(() => {
    const qName    = searchParams.get('name');
    const qCompany = searchParams.get('company');
    const qEmail   = searchParams.get('email');
    const qWf      = searchParams.get('workflows'); // e.g. '0,2,5'
    const qGroup   = searchParams.get('group');     // Phase 71 — audience group id
    const qAuto    = searchParams.get('auto');      // '1' = auto-start

    if (qName)    setClientName(qName);
    if (qCompany) setCompany(qCompany);
    if (qEmail)   setEmail(qEmail);
    if (qGroup) {
      setSelectedGroup(qGroup);
      localStorage.setItem(LS_GROUP_KEY, qGroup);
      const indices = getAudienceGroupIndices(qGroup);
      setSelectedWorkflows(indices);
      localStorage.setItem(LS_KEY, JSON.stringify(indices));
    } else if (qWf) {
      const indices = qWf.split(',').map(Number).filter(n => n >= 0 && n <= 7);
      if (indices.length > 0) setSelectedWorkflows(indices);
    }
    // Auto-start: requires name + company to be provided via URL too
    if (qAuto === '1' && qName && qCompany) {
      const resolvedGroup = qGroup ?? null;
      const wfIndices = qGroup
        ? getAudienceGroupIndices(qGroup)
        : qWf
          ? qWf.split(',').map(Number).filter(n => n >= 0 && n <= 7)
          : [0, 1, 2, 3, 4, 5, 6, 7];
      setDemoWorkflowIndices(wfIndices.length > 0 ? wfIndices : [0, 1, 2, 3, 4, 5, 6, 7]);
      setDemoAudienceGroup(resolvedGroup); // Phase 71
      startSelfDrivenDemo(qName.trim(), qCompany.trim());
      navigate('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWorkflow = (i: number) => {
    // Manual toggle clears the audience group selection
    setSelectedGroup(null);
    localStorage.setItem(LS_GROUP_KEY, '');
    setSelectedWorkflows(prev => {
      const next = prev.includes(i)
        ? prev.length > 1 ? prev.filter(x => x !== i) : prev
        : [...prev, i].sort((a, b) => a - b);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleGroupSelect = (groupId: string) => {
    const deselect = selectedGroup === groupId;
    const newGroup  = deselect ? null : groupId;
    setSelectedGroup(newGroup);
    localStorage.setItem(LS_GROUP_KEY, newGroup ?? '');
    if (!deselect) {
      const indices = getAudienceGroupIndices(groupId);
      setSelectedWorkflows(indices);
      localStorage.setItem(LS_KEY, JSON.stringify(indices));
    }
  };

  const handleStart = async () => {
    if (!clientName.trim() || !company.trim()) {
      setError('Please enter your name and company.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${DEMO_API}/start`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, company, email: email || null }),
      });
      if (!res.ok) { setError('Could not start the demo. Please try again.'); setLoading(false); return; }
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
      // Backend offline — launch demo in fully local mode
      sessionStorage.setItem('demo', JSON.stringify({
        sessionId: `demo-local-${Date.now()}`,
        guideSessionId: `guide-local-${Date.now()}`,
        currentStep: 'Welcome',
        narration: `Welcome to HealthQ Copilot, ${clientName}! This AI-powered clinical platform is your intelligent copilot for care — from voice intake and AI triage through scheduling, revenue cycle, and population health. Let's explore the future of healthcare together.`,
        stepInfo: { step: 'Welcome', title: 'Welcome', feedbackQuestion: 'How clear was this introduction?', feedbackTags: ['Clear', 'Relevant', 'Engaging'] },
        clientName,
        company,
      }));
      navigate('/demo/live');
    } finally {
      setLoading(false);
    }
  };

  // Phase 58 — Self-Driven Demo: launch AutoDemoPlayer on the live platform
  const handleSelfDriven = () => {
    if (!clientName.trim() || !company.trim()) {
      setError('Please enter your name and company.');
      return;
    }
    setError('');
    setDemoWorkflowIndices(selectedWorkflows); // Phase 64
    setDemoAudienceGroup(selectedGroup);       // Phase 71
    localStorage.setItem(LS_KEY, JSON.stringify(selectedWorkflows)); // Phase 65
    startSelfDrivenDemo(clientName.trim(), company.trim());
    navigate('/');
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
            sx={{ py: 1.5, fontSize: '1.1rem', mb: 2 }}
          >
            {loading ? 'Starting Demo...' : 'Start Guided Demo'}
          </Button>

          <Divider sx={{ mb: 2 }}>
            <Chip label="or" size="small" />
          </Divider>

          {/* Phase 58 — Self-Driven AI Demo */}
          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={handleSelfDriven}
            disabled={loading}
            startIcon={<AutoModeIcon />}
            sx={{
              py: 1.5,
              fontSize: '1rem',
              borderColor: 'primary.light',
              color: 'primary.main',
              '&:hover': { bgcolor: 'primary.50' },
            }}
          >
            AI Self-Driven Demo
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
            {selectedGroup
              ? `${DEMO_AUDIENCE_GROUPS.find(g => g.id === selectedGroup)?.name ?? ''} tour — AI narrates each step automatically`
              : 'The AI automatically navigates selected workflows with live narration'}
          </Typography>

          {/* Phase 70 — Audience Group Selector */}
          <Box sx={{ mt: 2, textAlign: 'left' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Who is this demo for?
            </Typography>

            {/* 2×2 grid for the four persona groups */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8, mb: 0.8 }}>
              {DEMO_AUDIENCE_GROUPS.filter(g => g.id !== 'full').map((group) => {
                const active   = selectedGroup === group.id;
                const indices  = getAudienceGroupIndices(group.id);
                const wfCount  = indices.length;
                const minDur   = Math.ceil(getTourDurationSec(indices) / 60);
                return (
                  <Box
                    key={group.id}
                    onClick={() => handleGroupSelect(group.id)}
                    sx={{
                      p: 1.2, borderRadius: 2, border: '1.5px solid',
                      borderColor: active ? group.color : 'divider',
                      bgcolor:     active ? `${group.color}18` : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                      '&:hover': { borderColor: group.color, bgcolor: `${group.color}0d` },
                    }}
                  >
                    <Typography variant="body2" fontWeight={700}
                      sx={{ color: active ? group.color : 'text.primary', lineHeight: 1.4 }}
                    >
                      {group.icon}&nbsp;{group.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                      {group.tagline}
                    </Typography>
                    <Typography variant="caption" sx={{
                      display: 'block', mt: 0.4, fontStyle: 'italic',
                      color: active ? group.color : 'text.disabled',
                    }}>
                      {wfCount} workflow{wfCount !== 1 ? 's' : ''} · ~{minDur} min
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {/* Full Platform Tour — full-width row */}
            {(() => {
              const full   = DEMO_AUDIENCE_GROUPS.find(g => g.id === 'full')!;
              const active = selectedGroup === 'full';
              const dur    = Math.ceil(getTourDurationSec([0, 1, 2, 3, 4, 5, 6, 7]) / 60);
              return (
                <Box
                  onClick={() => handleGroupSelect('full')}
                  sx={{
                    px: 1.5, py: 1, borderRadius: 2, border: '1.5px solid',
                    borderColor: active ? full.color : 'divider',
                    bgcolor:     active ? `${full.color}18` : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5,
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: full.color, bgcolor: `${full.color}0d` },
                  }}
                >
                  <Typography variant="body2" fontWeight={700}
                    sx={{ color: active ? full.color : 'text.primary', whiteSpace: 'nowrap' }}
                  >
                    {full.icon}&nbsp;{full.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {full.tagline}
                  </Typography>
                  <Typography variant="caption" sx={{ color: active ? full.color : 'text.disabled', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    8 workflows · ~{dur} min
                  </Typography>
                </Box>
              );
            })()}
          </Box>

          {/* Fine-tune individual workflows */}
          <Box sx={{ mt: 1.5, textAlign: 'left' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.6 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                {selectedGroup ? 'Fine-tune included workflows:' : 'Or choose individual workflows:'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                {selectedWorkflows.length} selected · ~{Math.ceil(getTourDurationSec(selectedWorkflows) / 60)} min
              </Typography>
            </Box>
            <Stack direction="row" flexWrap="wrap" gap={0.7}>
              {DEMO_WORKFLOWS.map((wf, i) => {
                const selected  = selectedWorkflows.includes(i);
                const sceneList = wf.scenes.map(s => `• ${s.title}`).join('\n');
                return (
                  <Tooltip
                    key={wf.id}
                    title={<Box sx={{ whiteSpace: 'pre-line', fontSize: '0.72rem' }}>{sceneList}</Box>}
                    arrow
                    placement="top"
                  >
                    <Chip
                      label={`${wf.icon}\u00a0${wf.name}`}
                      size="small"
                      onClick={() => toggleWorkflow(i)}
                      sx={{
                        cursor:      'pointer',
                        fontSize:    11,
                        fontWeight:  selected ? 700 : 400,
                        bgcolor:     selected ? 'primary.main' : 'transparent',
                        color:       selected ? '#fff' : 'text.secondary',
                        border:      '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        '&:hover':   { bgcolor: selected ? 'primary.dark' : 'action.hover' },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Stack>
            {selectedWorkflows.length < DEMO_WORKFLOWS.length && (
              <Typography
                variant="caption"
                sx={{ color: 'primary.main', cursor: 'pointer', mt: 0.5, display: 'inline-block' }}
                onClick={() => {
                  const all = [0, 1, 2, 3, 4, 5, 6, 7];
                  setSelectedWorkflows(all);
                  setSelectedGroup('full');
                  localStorage.setItem(LS_KEY, JSON.stringify(all));
                  localStorage.setItem(LS_GROUP_KEY, 'full');
                }}
              >
                Select all
              </Typography>
            )}
          </Box>

          {/* Phase 61 — Proof-points */}
          <Stack
            direction="row"
            spacing={1}
            justifyContent="center"
            flexWrap="wrap"
            sx={{ mt: 1.5, mb: 0.5, gap: 1 }}
          >
            {PROOF_POINTS.map(({ stat, label }) => (
              <Tooltip key={label} title={label} arrow>
                <Chip
                  label={<><strong>{stat}</strong>&nbsp;<span style={{ fontSize: 10, opacity: 0.8 }}>{label}</span></>}
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: 'primary.light', color: 'primary.main', fontSize: 11 }}
                />
              </Tooltip>
            ))}
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            No sign-up required · 5-minute guided tour · Provide feedback at each step
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
