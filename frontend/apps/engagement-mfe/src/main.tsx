import React from 'react';
import ReactDOM from 'react-dom/client';
import { PatientPortal } from './components/PatientPortal';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PatientPortal patientId="PAT-001" />
  </React.StrictMode>,
);
