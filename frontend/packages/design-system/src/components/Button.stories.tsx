import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Design System/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: { description: { component: 'HealthQ primary action button. Wraps MUI Button with clinical design tokens.' } },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Save Encounter', variant: 'default' },
};

export const Destructive: Story = {
  args: { children: 'Revoke Access', variant: 'destructive' },
};

export const Outline: Story = {
  args: { children: 'View Details', variant: 'outline' },
};

export const Secondary: Story = {
  args: { children: 'Cancel', variant: 'secondary' },
};

export const Ghost: Story = {
  args: { children: 'Back', variant: 'ghost' },
};

export const Disabled: Story = {
  args: { children: 'Submit Prior Auth', variant: 'default', disabled: true },
};

export const Small: Story = {
  args: { children: 'Add Note', size: 'sm' },
};

export const Large: Story = {
  args: { children: 'Start Consultation', size: 'lg' },
};
