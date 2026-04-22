/**
 * Phase 58 — DemoNarratorPanel
 *
 * A floating, semi-transparent AI narrator card anchored to the bottom-left
 * of the viewport. Displays the current workflow name, scene title, a
 * typewriter-streamed narration, and an optional "look here" hint.
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import type { DemoWorkflow, DemoScene } from './demoScripts';

interface DemoNarratorPanelProps {
  workflow:       DemoWorkflow;
  scene:          DemoScene;
  narrationText:  string;       // partial typewriter text
  workflowIdx:    number;
  sceneIdx:       number;
  countdown:      number;       // seconds remaining in current scene
  totalSec:       number;       // total seconds for current scene
}

export function DemoNarratorPanel({
  workflow,
  scene,
  narrationText,
  workflowIdx,
  sceneIdx,
  countdown,
  totalSec,
}: DemoNarratorPanelProps) {
  const totalScenes   = workflow.scenes.length;
  const elapsed       = Math.max(0, totalSec - countdown);
  const progressPct   = totalSec > 0 ? (elapsed / totalSec) * 100 : 0;
  const mins          = Math.floor(countdown / 60);
  const secs          = countdown % 60;
  const countdownStr  = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`;

  return (
    <Box
      sx={{
        position:  'fixed',
        bottom:    90,              // above DemoControlBar
        left:      20,
        zIndex:    1800,
        width:     360,
        maxWidth:  'calc(100vw - 40px)',
        borderRadius: 3,
        overflow:  'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)',
        bgcolor:   'rgba(15,20,35,0.88)',
        border:    '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display:    'flex',
          alignItems: 'center',
          gap:        1,
          px:         2,
          py:         1.2,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          bgcolor:    workflow.color + '22',
        }}
      >
        <Box
          sx={{
            width:  34,
            height: 34,
            borderRadius: '50%',
            bgcolor: workflow.color + '33',
            border:  `2px solid ${workflow.color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            flexShrink: 0,
          }}
        >
          {workflow.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: workflow.color, fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
            {workflow.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
            Scene {sceneIdx + 1} of {totalScenes} · Workflow {workflowIdx + 1}
          </Typography>
        </Box>
        <SmartToyIcon sx={{ fontSize: 18, color: 'rgba(255,255,255,0.4)' }} />
      </Box>

      {/* Scene progress bar + countdown */}
      <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.68rem' }}>
            {scene.title}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: workflow.color, fontWeight: 700, fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}
          >
            {countdownStr}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progressPct}
          sx={{
            height: 2,
            borderRadius: 1,
            bgcolor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': { bgcolor: workflow.color, transition: 'transform 1s linear' },
          }}
        />
      </Box>

      {/* Typewriter narration */}
      <Box sx={{ px: 2, pb: 1.5 }}>
        <Typography
          variant="body2"
          sx={{
            color:      'rgba(255,255,255,0.85)',
            lineHeight: 1.65,
            fontSize:   '0.82rem',
            minHeight:  72,
          }}
        >
          {narrationText}
          <Box
            component="span"
            sx={{
              display:   'inline-block',
              width:     2,
              height:    '1em',
              bgcolor:   workflow.color,
              ml:        0.3,
              verticalAlign: 'text-bottom',
              animation: 'hq-cursor-blink 1s steps(1) infinite',
              '@keyframes hq-cursor-blink': {
                '0%, 100%': { opacity: 1 },
                '50%':      { opacity: 0 },
              },
            }}
          />
        </Typography>
      </Box>

      {/* Highlight hint */}
      {scene.highlightHint && (
        <Box
          sx={{
            mx:           1.5,
            mb:           1.5,
            px:           1.5,
            py:           1,
            borderRadius: 2,
            bgcolor:      'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.1)',
            display:      'flex',
            alignItems:   'flex-start',
            gap:          1,
          }}
        >
          <LightbulbIcon sx={{ fontSize: 15, color: '#ffd54f', mt: 0.2, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#ffd54f', lineHeight: 1.5 }}>
            {scene.highlightHint}
          </Typography>
        </Box>
      )}

      {/* Scene dot indicators */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6, pb: 1.5 }}>
        {workflow.scenes.map((_, i) => (
          <Tooltip key={i} title={workflow.scenes[i].title} arrow placement="top">
            <Box
              sx={{
                width:        i === sceneIdx ? 18 : 6,
                height:       6,
                borderRadius: 3,
                bgcolor:      i === sceneIdx ? workflow.color : 'rgba(255,255,255,0.25)',
                transition:   'all 0.3s ease',
                cursor:       'default',
              }}
            />
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
