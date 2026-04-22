/**
 * Phase 58 — DemoControlBar
 *
 * Fixed bottom-center floating control bar for the self-driven AI demo.
 * Shows workflow progress, scene progress, play/pause, back/next, and exit.
 * The Next button has an SVG countdown arc so presenters see how long before
 * the demo auto-advances.
 */
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useGlobalStore } from '../../store';
import { DEMO_WORKFLOWS, getGlobalSceneIndex, TOTAL_SCENES } from './demoScripts';

interface DemoControlBarProps {
  countdown:  number;   // seconds remaining in current scene
  totalSec:   number;   // total seconds for current scene
}

const BAR_R  = 18;   // SVG circle radius
const BAR_C  = 2 * Math.PI * BAR_R; // circumference

export function DemoControlBar({ countdown, totalSec }: DemoControlBarProps) {
  const {
    demoWorkflowIdx,
    demoSceneIdx,
    demoPaused,
    demoClientName,
    demoCompany,
    pauseDemo,
    resumeDemo,
    advanceDemoScene,
    prevDemoScene,
    exitDemo,
  } = useGlobalStore();

  const workflow  = DEMO_WORKFLOWS[demoWorkflowIdx];
  const globalIdx = getGlobalSceneIndex(demoWorkflowIdx, demoSceneIdx);
  const overallPct = ((globalIdx + 1) / TOTAL_SCENES) * 100;

  // countdown arc — how much of the circle is "filled"
  const elapsed  = Math.max(0, totalSec - countdown);
  const arcFill  = totalSec > 0 ? (elapsed / totalSec) * BAR_C : 0;
  const arcEmpty = BAR_C - arcFill;

  return (
    <Box
      sx={{
        position:       'fixed',
        bottom:         16,
        left:           '50%',
        transform:      'translateX(-50%)',
        zIndex:         2000,
        display:        'flex',
        alignItems:     'center',
        gap:            1,
        px:             2,
        py:             1,
        borderRadius:   '40px',
        bgcolor:        'rgba(15,20,35,0.92)',
        border:         '1px solid rgba(255,255,255,0.14)',
        boxShadow:      '0 6px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(16px)',
        maxWidth:       'calc(100vw - 32px)',
        userSelect:     'none',
      }}
    >
      {/* AI icon + context */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, pr: 0.5 }}>
        <SmartToyIcon sx={{ fontSize: 20, color: workflow?.color ?? '#90caf9' }} />
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', lineHeight: 1.1 }}>
            {workflow?.icon} {workflow?.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem' }}>
            {demoClientName ? `${demoClientName} · ${demoCompany}` : 'Self-Driven Demo'}
          </Typography>
        </Box>
      </Box>

      {/* Divider */}
      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(255,255,255,0.1)', mx: 0.5 }} />

      {/* Back */}
      <Tooltip title="Previous scene" arrow>
        <span>
          <IconButton
            size="small"
            onClick={prevDemoScene}
            disabled={demoWorkflowIdx === 0 && demoSceneIdx === 0}
            sx={{ color: 'rgba(255,255,255,0.7)', '&:disabled': { color: 'rgba(255,255,255,0.2)' } }}
          >
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {/* Pause / Resume */}
      <Tooltip title={demoPaused ? 'Resume demo' : 'Pause demo'} arrow>
        <IconButton
          size="small"
          onClick={demoPaused ? resumeDemo : pauseDemo}
          sx={{
            color:   '#fff',
            bgcolor: demoPaused ? 'rgba(25,118,210,0.3)' : 'rgba(255,255,255,0.08)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' },
          }}
        >
          {demoPaused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      {/* Next with countdown arc */}
      <Tooltip title={`Next scene (${countdown}s)`} arrow>
        <Box
          component="span"
          sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* SVG countdown ring */}
          <Box
            component="svg"
            width={44}
            height={44}
            viewBox="0 0 44 44"
            sx={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
          >
            {/* Track */}
            <circle
              cx="22" cy="22" r={BAR_R}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="3"
            />
            {/* Progress */}
            <circle
              cx="22" cy="22" r={BAR_R}
              fill="none"
              stroke={workflow?.color ?? '#90caf9'}
              strokeWidth="3"
              strokeDasharray={`${arcFill} ${arcEmpty}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s linear' }}
            />
          </Box>
          <IconButton
            size="small"
            onClick={advanceDemoScene}
            sx={{
              width:  44,
              height: 44,
              color:  '#fff',
              bgcolor: 'rgba(255,255,255,0.06)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
            }}
          >
            <SkipNextIcon fontSize="small" />
          </IconButton>
          {/* Countdown label */}
          <Typography
            variant="caption"
            sx={{
              position:   'absolute',
              bottom:     -16,
              left:       '50%',
              transform:  'translateX(-50%)',
              color:      'rgba(255,255,255,0.5)',
              fontSize:   '0.6rem',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {countdown}s
          </Typography>
        </Box>
      </Tooltip>

      {/* Divider */}
      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(255,255,255,0.1)', mx: 0.5, mt: 1 }} />

      {/* Workflow dots */}
      <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center', mx: 0.5 }}>
        {DEMO_WORKFLOWS.map((wf, wi) => (
          <Tooltip key={wf.id} title={wf.name} arrow placement="top">
            <Box
              sx={{
                width:        wi === demoWorkflowIdx ? 14 : 7,
                height:       7,
                borderRadius: 4,
                bgcolor:      wi === demoWorkflowIdx ? (wf.color ?? '#fff') : 'rgba(255,255,255,0.2)',
                transition:   'all 0.3s ease',
                cursor:       'default',
              }}
            />
          </Tooltip>
        ))}
      </Box>

      {/* Divider */}
      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(255,255,255,0.1)', mx: 0.5 }} />

      {/* Exit */}
      <Tooltip title="Exit demo" arrow>
        <IconButton
          size="small"
          onClick={exitDemo}
          sx={{ color: 'rgba(255,100,100,0.8)', '&:hover': { color: '#ff5252', bgcolor: 'rgba(255,80,80,0.12)' } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Overall progress bar across the full bottom edge */}
      <LinearProgress
        variant="determinate"
        value={overallPct}
        sx={{
          position:     'absolute',
          bottom:       0,
          left:         0,
          right:        0,
          height:       3,
          borderRadius: '0 0 40px 40px',
          bgcolor:      'rgba(255,255,255,0.06)',
          '& .MuiLinearProgress-bar': { bgcolor: workflow?.color ?? '#90caf9' },
        }}
      />
    </Box>
  );
}
