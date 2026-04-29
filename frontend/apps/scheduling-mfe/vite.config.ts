import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'scheduling',
      filename: 'remoteEntry.js',
      exposes: {
        './SlotCalendar': './src/components/SlotCalendar.tsx',
        './BookingForm': './src/components/BookingForm.tsx',
        './WaitlistPanel': './src/components/WaitlistPanel.tsx',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        zustand: { singleton: true },
        '@healthcare/auth-client': { singleton: true },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3003,
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
