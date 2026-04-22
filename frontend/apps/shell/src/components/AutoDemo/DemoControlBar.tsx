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
import Chip from '@mui/material/Chip';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { useGlobalStore } from '../../store';
import { DEMO_WORKFLOWS, getGlobalSceneIndex, TOTAL_SCENES } from './demoScripts';
import { useState } from 'react';

interface DemoControlBarProps {
  countdown:  number;   // seconds remaining in current scene
  totalSec:   number;   // total seconds for current scene
  elapsedSec: number;   // Phase 65 — total demo elapsed seconds
}

const BAR_R  = 18;   // SVG circle radius
const BAR_C  = 2 * Math.PI * BAR_R; // circumference

export function DemoControlBar({ countdown, totalSec, elapsedSec }: DemoControlBarProps) {
  const {
    demoWorkflowIdx,
    demoSceneIdx,
    demoPaused,
    demoSpeed,
    demoClientName,
    demoCompany,
    demoWorkflowIndices,
    pauseDemo,
    resumeDemo,
    advanceDemoScene,
    prevDemoScene,
    exitDemo,
    setDemoScene,
    setDemoSpeed,
  } = useGlobalStore();

  const [copied, setCopied] = useState(false);

  const copyShareLink = () => {
    const wf = demoWorkflowIndices.length > 0 ? demoWorkflowIndices.join(',') : '0,1,2,3,4,5,6,7';
    const url = new URL('/demo', window.location.origin);
    if (demoClientName) url.searchParams.set('name',      demoClientName);
    if (demoCompany)    url.searchParams.set('company',   demoCompany);
    if (demoWorkflowIndices.length > 0) url.searchParams.set('workflows', wf);
    url.searchParams.set('auto', '1');
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => { /* clipboard denied */ });
  };

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
            {' · '}
            <Box
              component="span"
              sx={{ color: elapsedSec >= 3600 ? '#ef9a9a' : elapsedSec >= 1800 ? '#ffcc02' : 'rgba(255,255,255,0.45)' }}
            >
              {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:{String(elapsedSec % 60).padStart(2, '0')}
            </Box>
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

      {/* Workflow dots — only selected workflows fully visible, others dimmed */}
      <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center', mx: 0.5 }}>
        {DEMO_WORKFLOWS.map((wf, wi) => {
          const isSelected = demoWorkflowIndices.length === 0 || demoWorkflowIndices.includes(wi);
          const isActive   = wi === demoWorkflowIdx;
          return (
            <Tooltip key={wf.id} title={isSelected ? `Jump to: ${wf.name}` : `${wf.name} (not in tour)`} arrow placement="top">
              <Box
                onClick={() => isSelected && setDemoScene(wi, 0)}
                sx={{
                  width:        isActive ? 14 : 7,
                  height:       7,
                  borderRadius: 4,
                  bgcolor:      isActive
                    ? (wf.color ?? '#fff')
                    : isSelected
                      ? 'rgba(255,255,255,0.35)'
                      : 'rgba(255,255,255,0.08)',
                  transition:   'all 0.3s ease',
                  cursor:       isSelected ? 'pointer' : 'default',
                  '&:hover':    isSelected ? { bgcolor: wf.color ?? '#90caf9', opacity: 0.8 } : {},
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      {/* Divider */}
      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(255,255,255,0.1)', mx: 0.5 }} />

      {/* Speed toggle — 1× / 2× */}
      <Tooltip title="Playback speed" arrow>
        <Box sx={{ display: 'flex', gap: 0.3 }}>
          {([1, 2] as const).map(speed => (
            <Chip
              key={speed}
              label={`${speed}×`}
              size="small"
              onClick={() => setDemoSpeed(speed)}
              sx={{
                height:     22,
                fontSize:   '0.65rem',
                fontWeight: 700,
                cursor:     'pointer',
                bgcolor:    demoSpeed === speed ? (workflow?.color ?? '#90caf9') + '44' : 'rgba(255,255,255,0.08)',
                color:      demoSpeed === speed ? '#fff' : 'rgba(255,255,255,0.5)',
                border:     demoSpeed === speed ? `1px solid ${workflow?.color ?? '#90caf9'}` : '1px solid transparent',
                '&:hover':  { bgcolor: 'rgba(255,255,255,0.14)' },
              }}
            />
          ))}
        </Box>
      </Tooltip>

      {/* Divider */}
      <Box sx={{ width: 1, height: 32, bgcolor: 'rgba(255,255,255,0.1)', mx: 0.5 }} />

      {/* Phase 66 — Copy share link */}
      <Tooltip title={copied ? 'Link copied!' : 'Copy shareable demo link'} arrow>
        <IconButton
          size="small"
          onClick={copyShareLink}
          sx={{ color: copied ? '#66bb6a' : 'rgba(255,255,255,0.55)', '&:hover': { color: '#90caf9' } }}
        >
          {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>

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
