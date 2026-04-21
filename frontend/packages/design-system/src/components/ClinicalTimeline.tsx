import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import { type ReactNode } from 'react';

type EventType =
  | 'triage'
  | 'encounter'
  | 'medication'
  | 'lab'
  | 'imaging'
  | 'note'
  | 'discharge';

const _eventColors: Record<EventType, string> = {
  triage:     'error',
  encounter:  'primary',
  medication: 'warning',
  lab:        'info',
  imaging:    'secondary',
  note:       'grey',
  discharge:  'success',
};

export interface ClinicalEvent {
  id: string;
  type: EventType;
  title: string;
  description?: string;
  timestamp: string;   // ISO 8601
  author?: string;
  action?: ReactNode;  // optional CTA button
}

export interface ClinicalTimelineProps {
  events: ClinicalEvent[];
  maxItems?: number;
}

/**
 * Vertical chronological timeline of clinical events (encounters, labs, medications, notes).
 * Used in patient portal overview tab and care gap summary.
 * Built with standard MUI components (no @mui/lab dependency).
 */
export function ClinicalTimeline({ events, maxItems }: ClinicalTimelineProps) {
  const displayed = maxItems ? events.slice(0, maxItems) : events;

  const dotColors: Record<EventType, string> = {
    triage:     'error.main',
    encounter:  'primary.main',
    medication: 'warning.main',
    lab:        'info.main',
    imaging:    'secondary.main',
    note:       'text.disabled',
    discharge:  'success.main',
  };

  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {displayed.map((event, index) => (
        <Box component="li" key={event.id} sx={{ display: 'flex', gap: 1.5, pb: index < displayed.length - 1 ? 2 : 0 }}>
          {/* Date column */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 48, pt: 0.5, textAlign: 'right', flexShrink: 0 }}
          >
            {new Date(event.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Typography>

          {/* Connector column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: dotColors[event.type], mt: 0.5 }} />
            {index < displayed.length - 1 && (
              <Divider orientation="vertical" sx={{ flex: 1, my: 0.5 }} />
            )}
          </Box>

          {/* Content column */}
          <Stack sx={{ pb: 0.5, flex: 1 }} spacing={0.25}>
            <Typography variant="subtitle2" fontWeight={600}>
              {event.title}
            </Typography>
            {event.description && (
              <Typography variant="body2" color="text.secondary">
                {event.description}
              </Typography>
            )}
            {event.author && (
              <Typography variant="caption" color="text.disabled">
                {event.author}
              </Typography>
            )}
            {event.action && <Box mt={0.5}>{event.action}</Box>}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}
