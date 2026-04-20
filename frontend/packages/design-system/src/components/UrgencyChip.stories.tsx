import type { Meta, StoryObj } from '@storybook/react';
import { UrgencyChip } from './UrgencyChip';
import Stack from '@mui/material/Stack';

const meta = {
  title: 'Clinical/UrgencyChip',
  component: UrgencyChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: [
          'Colour-coded triage urgency chip following the **Manchester Triage System** (MTS) priority conventions.',
          '',
          '| Level | Colour | Target Time |',
          '|-------|--------|-------------|',
          '| P1 — Immediate | Red | Resuscitate |',
          '| P2 — Emergent  | Orange | ≤ 10 min |',
          '| P3 — Urgent    | Blue | ≤ 30 min |',
          '| P4 — Less Urgent | Green | ≤ 1 hour |',
          '| P5 — Non-Urgent | White/Grey | ≤ 2 hours |',
        ].join('\n'),
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    level: {
      control: 'select',
      options: ['P1', 'P2', 'P3', 'P4', 'P5'],
    },
    showLabel: { control: 'boolean' },
  },
} satisfies Meta<typeof UrgencyChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const P1Immediate: Story = { args: { level: 'P1', showLabel: true } };
export const P2Emergent: Story = { args: { level: 'P2', showLabel: true } };
export const P3Urgent: Story = { args: { level: 'P3', showLabel: true } };
export const P4LessUrgent: Story = { args: { level: 'P4', showLabel: true } };
export const P5NonUrgent: Story = { args: { level: 'P5', showLabel: true } };

export const AllLevels: Story = {
  render: () => (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {(['P1', 'P2', 'P3', 'P4', 'P5'] as const).map(level => (
        <UrgencyChip key={level} level={level} />
      ))}
    </Stack>
  ),
};

export const CompactBadgesOnly: Story = {
  render: () => (
    <Stack direction="row" spacing={1}>
      {(['P1', 'P2', 'P3', 'P4', 'P5'] as const).map(level => (
        <UrgencyChip key={level} level={level} showLabel={false} />
      ))}
    </Stack>
  ),
};
