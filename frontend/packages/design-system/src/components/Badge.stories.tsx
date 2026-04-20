import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta = {
  title: 'Design System/Badge',
  component: Badge,
  parameters: { layout: 'centered', docs: { description: { component: 'Status badge / chip used for clinical state indicators.' } } },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'success', 'warning', 'danger'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Active', variant: 'default' } };
export const Success: Story = { args: { children: 'Completed', variant: 'success' } };
export const Warning: Story = { args: { children: 'Pending Review', variant: 'warning' } };
export const Destructive: Story = { args: { children: 'Overdue', variant: 'destructive' } };
export const Outline: Story = { args: { children: 'Draft', variant: 'outline' } };
