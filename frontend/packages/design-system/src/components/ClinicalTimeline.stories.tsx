import type { Meta, StoryObj } from '@storybook/react';
import { ClinicalTimeline, type ClinicalEvent } from './ClinicalTimeline';
import Button from '@mui/material/Button';

const meta = {
  title: 'Clinical/ClinicalTimeline',
  component: ClinicalTimeline,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Chronological vertical timeline of clinical events — encounters, labs, medications, imaging, notes, and discharge. ' +
          'Used in patient portal overview and care gap summary panels.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ClinicalTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleEvents: ClinicalEvent[] = [
  {
    id: 'evt-1',
    type: 'triage',
    title: 'Emergency Triage',
    description: 'P2 — Chest pain with diaphoresis',
    timestamp: '2026-04-20T08:15:00Z',
    author: 'RN Taylor',
  },
  {
    id: 'evt-2',
    type: 'lab',
    title: 'Troponin I Result',
    description: '0.04 ng/mL — borderline elevated',
    timestamp: '2026-04-20T08:45:00Z',
    author: 'Lab Auto',
    action: <Button size="small" variant="outlined">View Full Report</Button>,
  },
  {
    id: 'evt-3',
    type: 'imaging',
    title: 'Chest X-Ray',
    description: 'No acute cardiopulmonary process',
    timestamp: '2026-04-20T09:10:00Z',
    author: 'Dr Radiology',
  },
  {
    id: 'evt-4',
    type: 'medication',
    title: 'Aspirin 325mg',
    description: 'Single dose — oral administration',
    timestamp: '2026-04-20T09:20:00Z',
    author: 'RN Taylor',
  },
  {
    id: 'evt-5',
    type: 'encounter',
    title: 'Cardiology Consult',
    description: 'NSTEMI ruled in — admit for observation',
    timestamp: '2026-04-20T10:00:00Z',
    author: 'Dr Cardio',
  },
  {
    id: 'evt-6',
    type: 'note',
    title: 'Nursing Progress Note',
    description: 'Patient haemodynamically stable. Pain 3/10.',
    timestamp: '2026-04-20T12:00:00Z',
    author: 'RN Chen',
  },
  {
    id: 'evt-7',
    type: 'discharge',
    title: 'Discharge Summary',
    description: 'Discharged to home with cardiology follow-up in 7 days',
    timestamp: '2026-04-21T14:30:00Z',
    author: 'Dr Cardio',
  },
];

export const FullTimeline: Story = {
  args: { events: sampleEvents },
};

export const RecentEventsOnly: Story = {
  args: { events: sampleEvents, maxItems: 3 },
};
