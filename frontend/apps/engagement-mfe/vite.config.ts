import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'engagement',
      filename: 'remoteEntry.js',
      exposes: {
        './PatientPortal': './src/components/PatientPortal.tsx',
        './NotificationInbox': './src/components/NotificationInbox.tsx',
        './DeliveryAnalyticsDashboard': './src/components/DeliveryAnalyticsDashboard.tsx',
        './ConsentManagementPanel': './src/components/ConsentManagementPanel.tsx',
        './PatientProfilePanel': './src/components/PatientProfilePanel.tsx',       // Phase 22
        './PatientRegistrationPanel': './src/components/PatientRegistrationPanel.tsx', // Phase 22
        './OcrDocumentPanel': './src/components/OcrDocumentPanel.tsx',             // Phase 22
        './OtpVerificationPanel': './src/components/OtpVerificationPanel.tsx',     // Phase 23
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        zustand: { singleton: true },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3007,
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
