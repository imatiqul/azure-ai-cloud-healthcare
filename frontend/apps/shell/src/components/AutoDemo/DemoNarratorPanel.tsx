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
import IconButton from '@mui/material/IconButton';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import type { DemoWorkflow, DemoScene } from './demoScripts';
import { useGlobalStore } from '../../store';

interface LiveKpi {
  pendingTriage:     number;
  highRiskPatients:  number;
  codingQueue:       number;
  bookedToday:       number;
  triageAiAccuracy:  number;
}

interface DemoNarratorPanelProps {
  workflow:       DemoWorkflow;
  scene:          DemoScene;
  narrationText:  string;       // partial typewriter text
  workflowIdx:    number;
  sceneIdx:       number;
  countdown:      number;       // seconds remaining in current scene
  totalSec:       number;       // total seconds for current scene
  liveKpi?:       LiveKpi | null;
}

// Rotate which KPI is shown in the badge every render (stable per scene)
const KPI_LABELS: Array<{ key: keyof LiveKpi; label: string }> = [
  { key: 'pendingTriage',    label: 'cases pending triage' },
  { key: 'highRiskPatients', label: 'high-risk patients' },
  { key: 'codingQueue',      label: 'coding jobs queued' },
  { key: 'bookedToday',      label: 'appointments today' },
];

export function DemoNarratorPanel({
  workflow,
  scene,
  narrationText,
  workflowIdx,
  sceneIdx,
  countdown,
  totalSec,
  liveKpi,
}: DemoNarratorPanelProps) {
  const { setDemoScene } = useGlobalStore();
  const [collapsed, setCollapsed] = useState(false);
  // Pick a KPI to feature based on the current scene index
  const kpiSlot = KPI_LABELS[(workflowIdx * 3 + sceneIdx) % KPI_LABELS.length];
  const kpiValue = liveKpi ? liveKpi[kpiSlot.key] : null;
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
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SmartToyIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.35)' }} />
            <Tooltip title={collapsed ? 'Expand narrator' : 'Collapse narrator'} arrow placement="left">
            <IconButton
              size="small"
              onClick={() => setCollapsed(c => !c)}
              sx={{ color: 'rgba(255,255,255,0.4)', p: 0.2, '&:hover': { color: '#fff' } }}
            >
              {collapsed ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ExpandLessIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          </Box>
          {kpiValue !== null && !collapsed && (
            <Tooltip title="Live platform data" arrow placement="left">
              <Chip
                icon={<WifiTetheringIcon sx={{ fontSize: '0.7rem !important' }} />}
                label={`${kpiValue} ${kpiSlot.label}`}
                size="small"
                sx={{
                  height:     18,
                  fontSize:   '0.6rem',
                  fontWeight: 700,
                  bgcolor:    workflow.color + '33',
                  color:      workflow.color,
                  border:     `1px solid ${workflow.color}55`,
                  '& .MuiChip-icon': { color: workflow.color },
                  animation:  'hq-pulse 2s ease-in-out infinite',
                  '@keyframes hq-pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%':      { opacity: 0.65 },
                  },
                }}
              />
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Collapsible body */}
      {!collapsed && (
        <>
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

      {/* Phase 66 — Presenter talking point (amber, discreet) */}
      {scene.presenterNotes && (
        <Box
          sx={{
            mx:           1.5,
            mb:           1.5,
            px:           1.5,
            py:           1,
            borderRadius: 2,
            bgcolor:      'rgba(255,152,0,0.08)',
            border:       '1px solid rgba(255,152,0,0.22)',
            display:      'flex',
            alignItems:   'flex-start',
            gap:          1,
          }}
        >
          <TipsAndUpdatesIcon sx={{ fontSize: 14, color: '#ff9800', mt: 0.25, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'rgba(255,152,0,0.9)', lineHeight: 1.5, fontSize: '0.7rem' }}>
            {scene.presenterNotes}
          </Typography>
        </Box>
      )}

      {/* Scene dot indicators — clickable */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6, pb: 1.5 }}>
        {workflow.scenes.map((_, i) => (
          <Tooltip key={i} title={`Jump to: ${workflow.scenes[i].title}`} arrow placement="top">
            <Box
              onClick={() => setDemoScene(workflowIdx, i)}
              sx={{
                width:        i === sceneIdx ? 18 : 6,
                height:       6,
                borderRadius: 3,
                bgcolor:      i === sceneIdx ? workflow.color : 'rgba(255,255,255,0.25)',
                transition:   'all 0.3s ease',
                cursor:       'pointer',
                '&:hover':    { bgcolor: workflow.color, opacity: 0.7 },
              }}
            />
          </Tooltip>
        ))}
      </Box>
        </>
      )}
    </Box>
  );
}
