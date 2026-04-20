import type { Preview } from '@storybook/react';
import { ThemeProvider } from '../src/ThemeProvider';
import React from 'react';

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // WCAG 2.1 AA ruleset
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
        ],
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#121212' },
        { name: 'clinical-grey', value: '#f5f5f5' },
      ],
    },
  },
};

export default preview;
