import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import Typography from '@mui/material/Typography';

const meta = {
  title: 'Design System/Card',
  component: Card,
  parameters: {
    layout: 'padded',
    docs: { description: { component: 'Surface container for clinical data sections and dashboard widgets.' } },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card sx={{ maxWidth: 360 }}>
      <CardHeader>
        <CardTitle>Patient Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          Jane Doe — 42y — MRN: 100023
        </Typography>
      </CardContent>
    </Card>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Card sx={{ maxWidth: 400 }}>
      <CardHeader>
        <CardTitle>Lab Results</CardTitle>
      </CardHeader>
      <CardContent>
        <Typography variant="body2">HbA1c: 7.2% — within target range</Typography>
      </CardContent>
    </Card>
  ),
};
