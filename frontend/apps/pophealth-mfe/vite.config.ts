import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'pophealth',
      filename: 'remoteEntry.js',
      exposes: {
        './RiskPanel': './src/components/RiskPanel.tsx',
        './CareGapList': './src/components/CareGapList.tsx',
        './RiskTrajectoryPanel': './src/components/RiskTrajectoryPanel.tsx',
        './SdohAssessmentPanel': './src/components/SdohAssessmentPanel.tsx',
        './CostPredictionPanel': './src/components/CostPredictionPanel.tsx',
        './HedisMeasuresPanel': './src/components/HedisMeasuresPanel.tsx',          // Phase 23
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        '@mui/material': { singleton: true },
        '@emotion/react': { singleton: true },
        '@emotion/styled': { singleton: true },
        '@healthcare/auth-client': { singleton: true },
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 3004,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { target: 'esnext' },
});
