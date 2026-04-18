import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';

export interface AiThinkingPanelProps {
  /** Accumulated reasoning text streamed from Azure OpenAI */
  thinkingText: string;
  /** Whether the AI is currently streaming tokens */
  isStreaming: boolean;
  /** Whether the stream has completed */
  isDone: boolean;
}

/**
 * Real-time AI reasoning visualization panel.
 * Displays streaming Azure OpenAI tokens as they arrive via Azure Web PubSub,
 * giving clinicians full visibility into the AI's clinical decision process.
 */
export function AiThinkingPanel({ thinkingText, isStreaming, isDone }: AiThinkingPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new tokens arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinkingText]);

  if (!isStreaming && !isDone && !thinkingText) return null;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'primary.200',
        borderRadius: 2,
        bgcolor: 'primary.50',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: 'primary.100',
          borderBottom: 1,
          borderColor: 'primary.200',
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: isStreaming ? 'success.main' : isDone ? 'primary.main' : 'grey.400',
            animation: isStreaming ? 'pulse 1.2s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.3 },
            },
          }}
        />
        <Typography variant="caption" fontWeight="bold" color="primary.main">
          AI Clinical Reasoning
        </Typography>
        {isStreaming && (
          <Chip label="Live" size="small" color="success" sx={{ height: 16, fontSize: 10, ml: 'auto' }} />
        )}
        {isDone && (
          <Chip label="Complete" size="small" color="primary" sx={{ height: 16, fontSize: 10, ml: 'auto' }} />
        )}
      </Box>

      {/* Streaming progress bar */}
      {isStreaming && (
        <LinearProgress
          variant="indeterminate"
          sx={{ height: 2, bgcolor: 'primary.100' }}
        />
      )}

      {/* Streaming text */}
      <Box
        ref={scrollRef}
        sx={{
          px: 2,
          py: 1.5,
          maxHeight: 220,
          overflowY: 'auto',
          fontFamily: 'monospace',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'primary.300', borderRadius: 2 },
        }}
      >
        <Typography
          variant="body2"
          component="pre"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            m: 0,
            color: 'text.primary',
            lineHeight: 1.6,
          }}
        >
          {thinkingText}
          {isStreaming && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: '2px',
                height: '1em',
                bgcolor: 'primary.main',
                ml: '1px',
                verticalAlign: 'text-bottom',
                animation: 'blink 1s step-end infinite',
                '@keyframes blink': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0 },
                },
              }}
            />
          )}
        </Typography>
      </Box>

      {isDone && !isStreaming && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            ✓ Reasoning complete — triage decision follows
          </Typography>
        </Box>
      )}
    </Box>
  );
}
