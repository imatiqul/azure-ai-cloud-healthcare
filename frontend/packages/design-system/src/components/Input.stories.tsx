import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta = {
  title: 'Design System/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: { description: { component: 'Form text field for clinical data entry. Wraps MUI TextField with consistent sizing.' } },
  },
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    error: { control: 'boolean' },
    helperText: { control: 'text' },
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Patient Name', placeholder: 'Enter full name' },
};

export const WithError: Story = {
  args: { label: 'Date of Birth', error: true, helperText: 'Must be a valid date' },
};

export const Disabled: Story = {
  args: { label: 'MRN', value: '100023', disabled: true },
};
