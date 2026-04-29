import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'revenue',
      filename: 'remoteEntry.js',
      exposes: {
        './CodingQueue': './src/components/CodingQueue.tsx',
        './PriorAuthTracker': './src/components/PriorAuthTracker.tsx',
        './DenialManager': './src/components/DenialManager.tsx',
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
    port: 3005,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { target: 'esnext' },
});
