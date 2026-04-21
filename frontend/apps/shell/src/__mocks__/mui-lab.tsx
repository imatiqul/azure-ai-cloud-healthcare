/**
 * Mock for @mui/lab components in Vitest test environment.
 * @mui/lab is not installed; ClinicalTimeline.tsx uses it but is not rendered in shell tests.
 */
import { forwardRef } from 'react';
import type { ReactNode } from 'react';

function stub(displayName: string) {
  const Cmp = forwardRef<HTMLDivElement, { children?: ReactNode }>(({ children }, ref) => (
    <div ref={ref} data-testid={`mui-lab-${displayName.toLowerCase()}`}>{children}</div>
  ));
  Cmp.displayName = displayName;
  return Cmp;
}

export const Timeline = stub('Timeline');
export const TimelineItem = stub('TimelineItem');
export const TimelineSeparator = stub('TimelineSeparator');
export const TimelineConnector = stub('TimelineConnector');
export const TimelineContent = stub('TimelineContent');
export const TimelineDot = stub('TimelineDot');
export const TimelineOppositeContent = stub('TimelineOppositeContent');

export default Timeline;
