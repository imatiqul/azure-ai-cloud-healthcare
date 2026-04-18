import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      exposes: {
        './store': './src/store/globalStore.ts',
      },
      remotes: {
        voice: {
          type: 'module',
          name: 'voice',
          entry: process.env.VOICE_MFE_URL || 'http://localhost:3001/remoteEntry.js',
        },
        triage: {
          type: 'module',
          name: 'triage',
          entry: process.env.TRIAGE_MFE_URL || 'http://localhost:3002/remoteEntry.js',
        },
        scheduling: {
          type: 'module',
          name: 'scheduling',
          entry: process.env.SCHEDULING_MFE_URL || 'http://localhost:3003/remoteEntry.js',
        },
        pophealth: {
          type: 'module',
          name: 'pophealth',
          entry: process.env.POPHEALTH_MFE_URL || 'http://localhost:3004/remoteEntry.js',
        },
        revenue: {
          type: 'module',
          name: 'revenue',
          entry: process.env.REVENUE_MFE_URL || 'http://localhost:3005/remoteEntry.js',
        },
        encounters: {
          type: 'module',
          name: 'encounters',
          entry: process.env.ENCOUNTERS_MFE_URL || 'http://localhost:3006/remoteEntry.js',
        },
        engagement: {
          type: 'module',
          name: 'engagement',
          entry: process.env.ENGAGEMENT_MFE_URL || 'http://localhost:3007/remoteEntry.js',
        },
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        zustand: { singleton: true },
        '@microsoft/signalr': { singleton: true },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
});
