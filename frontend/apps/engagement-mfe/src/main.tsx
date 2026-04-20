import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { PatientPortal } from './components/PatientPortal';
import { AuthCallback } from './auth/AuthCallback';
import { b2cConfigured, msalInstance } from './auth/msalConfig';

// Route /auth/callback to the dedicated handler; everything else renders the portal.
const isAuthCallback = window.location.pathname.startsWith('/auth/callback');

const portalContent = isAuthCallback ? <AuthCallback /> : <PatientPortal />;

const root = (
  <React.StrictMode>
    {b2cConfigured ? (
      <MsalProvider instance={msalInstance}>
        {portalContent}
      </MsalProvider>
    ) : (
      // B2C not yet provisioned (Phase 2) — operate in unauthenticated mode.
      // Patient can enter their ID manually via the portal search field.
      <PatientPortal />
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(root);

