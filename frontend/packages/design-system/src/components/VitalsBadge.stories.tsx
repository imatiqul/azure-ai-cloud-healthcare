import type { Meta, StoryObj } from '@storybook/react';
import { VitalsBadge, type VitalReading } from './VitalsBadge';
import Stack from '@mui/material/Stack';

const meta = {
  title: 'Clinical/VitalsBadge',
  component: VitalsBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Displays a single vital sign reading with colour-coded status indicator. ' +
          'Status: **normal** (green), **warning** (amber), **critical** (red).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    'vital.status': {
      control: 'select',
      options: ['normal', 'warning', 'critical'],
    },
    compact: { control: 'boolean' },
  },
} satisfies Meta<typeof VitalsBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeartRate: Story = {
  args: {
    vital: { label: 'HR', value: '72 bpm', status: 'normal', timestamp: '2026-04-20T09:30:00Z' },
  },
};

export const SpO2Critical: Story = {
  args: {
    vital: { label: 'SpO₂', value: '88%', status: 'critical', timestamp: '2026-04-20T09:31:00Z' },
  },
};

export const BloodPressureWarning: Story = {
  args: {
    vital: { label: 'BP', value: '145/95', status: 'warning', timestamp: '2026-04-20T09:32:00Z' },
  },
};

const sampleVitals: VitalReading[] = [
  { label: 'HR',   value: '88 bpm', status: 'normal' },
  { label: 'SpO₂', value: '96%',    status: 'normal' },
  { label: 'BP',   value: '148/92', status: 'warning' },
  { label: 'Temp', value: '38.9°C', status: 'warning' },
  { label: 'RR',   value: '22/min', status: 'critical' },
  { label: 'GCS',  value: '14',     status: 'normal' },
];

export const VitalsPanel: Story = {
  render: () => (
    <Stack direction="row" spacing={1.5} flexWrap="wrap">
      {sampleVitals.map(v => (
        <VitalsBadge key={v.label} vital={v} />
      ))}
    </Stack>
  ),
};

export const VitalsPanelCompact: Story = {
  render: () => (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {sampleVitals.map(v => (
        <VitalsBadge key={v.label} vital={v} compact />
      ))}
    </Stack>
  ),
};
