import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { type ReactNode } from 'react';

type EventType =
  | 'triage'
  | 'encounter'
  | 'medication'
  | 'lab'
  | 'imaging'
  | 'note'
  | 'discharge';

const eventColors: Record<EventType, 'error' | 'warning' | 'primary' | 'secondary' | 'info' | 'success' | 'grey'> = {
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
 */
export function ClinicalTimeline({ events, maxItems }: ClinicalTimelineProps) {
  const displayed = maxItems ? events.slice(0, maxItems) : events;

  return (
    <Timeline sx={{ m: 0, p: 0 }}>
      {displayed.map((event, index) => (
        <TimelineItem key={event.id}>
          <TimelineOppositeContent
            sx={{ flex: 0.2, pr: 1 }}
            color="text.secondary"
            variant="caption"
          >
            {new Date(event.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </TimelineOppositeContent>

          <TimelineSeparator>
            <TimelineDot color={eventColors[event.type]} variant="filled" />
            {index < displayed.length - 1 && <TimelineConnector />}
          </TimelineSeparator>

          <TimelineContent sx={{ pb: 2 }}>
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
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
