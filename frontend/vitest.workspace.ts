import { defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = path.resolve(__dirname);
const setup = [path.resolve(root, 'vitest.setup.ts')];

const mfes = [
  'triage-mfe',
  'voice-mfe',
  'scheduling-mfe',
  'pophealth-mfe',
  'revenue-mfe',
  'encounters-mfe',
  'engagement-mfe',
];

export default [
  // shell has extra MUI lab aliases
  defineProject({
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
      name: 'shell',
      root: path.resolve(root, 'apps/shell'),
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      globals: true,
      setupFiles: setup,
      css: false,
      testTimeout: 15000,
      retry: 2,
    },
  }),
  // all other MFEs
  ...mfes.map((name) =>
    defineProject({
      plugins: [react()],
      resolve: {
        alias: { '@': path.resolve(root, `apps/${name}/src`) },
      },
      test: {
        name,
        root: path.resolve(root, `apps/${name}`),
        include: ['src/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        globals: true,
        setupFiles: setup,
        css: false,
        testTimeout: 15000,
      },
    })
  ),
];
