import type { Meta, StoryObj } from '@storybook/react';
import { PatientCard } from './PatientCard';
import Stack from '@mui/material/Stack';

const meta = {
  title: 'Clinical/PatientCard',
  component: PatientCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Compact patient summary card used in triage queues, worklists, and encounter lists. ' +
          'Renders avatar initials, age/gender/MRN, urgency chip, and room number.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PatientCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CriticalPatient: Story = {
  args: {
    patientId: 'PAT-001',
    displayName: 'Jane Doe',
    dateOfBirth: '1982-03-15',
    gender: 'F',
    mrn: '100023',
    urgency: 'P1',
    room: '3A',
  },
};

export const RoutinePatient: Story = {
  args: {
    patientId: 'PAT-002',
    displayName: 'John Smith',
    dateOfBirth: '1965-07-28',
    gender: 'M',
    mrn: '100045',
    urgency: 'P4',
  },
};

export const NoUrgency: Story = {
  args: {
    patientId: 'PAT-003',
    displayName: 'Maria García',
    dateOfBirth: '1995-11-02',
  },
};

export const TriageQueue: Story = {
  render: () => (
    <Stack spacing={1.5} maxWidth={480}>
      {[
        { patientId: 'PAT-001', displayName: 'Alice Johnson', dateOfBirth: '1950-01-10', urgency: 'P1' as const, room: '1A' },
        { patientId: 'PAT-002', displayName: 'Bob Williams', dateOfBirth: '1978-06-22', urgency: 'P2' as const, room: '2B' },
        { patientId: 'PAT-003', displayName: 'Clara Davis', dateOfBirth: '2005-09-14', urgency: 'P3' as const },
        { patientId: 'PAT-004', displayName: 'Derek Evans', dateOfBirth: '1990-12-30', urgency: 'P5' as const },
      ].map(p => (
        <PatientCard
          key={p.patientId}
          {...p}
          onClick={() => alert(`Navigate to ${p.patientId}`)}
        />
      ))}
    </Stack>
  ),
};
