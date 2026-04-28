import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = path.resolve(__dirname);
const setup = [path.resolve(root, 'vitest.setup.ts')];

const baseTest = {
  environment: 'jsdom' as const,
  globals: true,
  setupFiles: setup,
  css: false,
  testTimeout: 15000,
  include: ['src/**/*.test.{ts,tsx}'],
};

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': path.resolve(root, 'apps/shell/src'),
            '@mui/lab/Timeline':                path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineItem':            path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineSeparator':       path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineConnector':       path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineContent':         path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineDot':             path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
            '@mui/lab/TimelineOppositeContent': path.resolve(root, 'apps/shell/src/__mocks__/mui-lab.tsx'),
          },
        },
        test: {
          ...baseTest,
          name: 'shell',
          root: path.resolve(root, 'apps/shell'),
          retry: 2,
        },
      },
      ...[
        'triage-mfe',
        'voice-mfe',
        'scheduling-mfe',
        'pophealth-mfe',
        'revenue-mfe',
        'encounters-mfe',
        'engagement-mfe',
      ].map((name) => ({
        plugins: [react()],
        resolve: {
          alias: { '@': path.resolve(root, `apps/${name}/src`) },
        },
        test: {
          ...baseTest,
          name,
          root: path.resolve(root, `apps/${name}`),
        },
      })),
    ],
  },
});
