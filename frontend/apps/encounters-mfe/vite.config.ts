import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'encounters',
      filename: 'remoteEntry.js',
      exposes: {
        './EncounterList': './src/components/EncounterList.tsx',
        './CreateEncounterModal': './src/components/CreateEncounterModal.tsx',
        './LabDeltaFlagsPanel': './src/components/LabDeltaFlagsPanel.tsx',
        './DrugInteractionChecker': './src/components/DrugInteractionChecker.tsx',
        './FhirObservationViewer': './src/components/FhirObservationViewer.tsx',
        './FhirEverythingViewer': './src/components/FhirEverythingViewer.tsx',     // Phase 22
        './MedicationPanel': './src/components/MedicationPanel.tsx',              // Phase 30
        './AllergyPanel': './src/components/AllergyPanel.tsx',                    // Phase 30
        './ProblemListPanel': './src/components/ProblemListPanel.tsx',            // Phase 30
        './ImmunizationPanel': './src/components/ImmunizationPanel.tsx',          // Phase 30
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
    port: 3006,
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
