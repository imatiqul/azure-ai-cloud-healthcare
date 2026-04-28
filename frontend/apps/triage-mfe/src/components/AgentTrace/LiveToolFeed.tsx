import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

/**
 * W5.2 — live tool-call event delivered via Web PubSub.
 * Mirrors the `ToolInvoked` / `ToolCompleted` payloads emitted by the
 * .NET LiveToolEventFilter on the Agents service.
 */
export type LiveToolEvent =
  | { kind: 'invoked'; pluginName: string; functionName: string; agentName: string; timestamp: string }
  | { kind: 'completed'; pluginName: string; functionName: string; durationMs: number; success: boolean; timestamp: string };

interface LiveToolFeedProps {
  events: LiveToolEvent[];
  /** Cap how many events render — older ones drop out. */
  maxItems?: number;
}

/** Pure, prop-driven feed of agent tool activity. */
export function LiveToolFeed({ events, maxItems = 20 }: LiveToolFeedProps) {
  if (!events || events.length === 0) {
    return null;
  }
  const visible = events.slice(-maxItems);
  return (
    <Box aria-label="Live agent tool activity" sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1 }}>
      <Typography variant="subtitle2">Live tool activity</Typography>
      <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', pl: 0, m: 0, fontSize: 12 }}>
        {visible.map((e, i) => (
          <li key={`${e.timestamp}-${i}`}>
            {e.kind === 'invoked' ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label="invoked" color="info" />
                <strong>{e.pluginName}.{e.functionName}</strong>
                <span>by {e.agentName}</span>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label="completed"
                  color={e.success ? 'success' : 'error'}
                />
                <strong>{e.pluginName}.{e.functionName}</strong>
                <span>{e.durationMs.toFixed(0)} ms</span>
              </Stack>
            )}
          </li>
        ))}
      </Stack>
    </Box>
  );
}
