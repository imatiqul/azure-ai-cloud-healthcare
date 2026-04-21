import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // @mui/lab is not installed — stub all lab imports so ClinicalTimeline.tsx doesn't crash tests
      '@mui/lab/Timeline':                path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineItem':            path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineSeparator':       path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineConnector':       path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineContent':         path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineDot':             path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
      '@mui/lab/TimelineOppositeContent': path.resolve(__dirname, 'src/__mocks__/mui-lab.tsx'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    css: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'cobertura'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
