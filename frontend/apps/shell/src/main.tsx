import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@healthcare/design-system';
import { AuthProvider, useSession } from '@healthcare/auth-client';
import { setAuthTokenProvider } from '@healthcare/graphql-client';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/i18n';
import App from './App';
import { ToastProvider } from './components/ToastProvider';

// Apply RTL direction when Arabic is active
const lang = i18n.language?.split('-')[0] ?? 'en';
document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = lang;

i18n.on('languageChanged', (lng) => {
  const l = lng.split('-')[0];
  document.documentElement.dir  = l === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = l;
});

/**
 * Keeps the graphql-client global token provider in sync with the MSAL session.
 * Must be rendered inside <AuthProvider> so useSession() has access to context.
 */
function GqlAuthSync() {
  const { session } = useSession();
  useEffect(() => {
    setAuthTokenProvider(() => session?.accessToken);
  }, [session]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <GqlAuthSync />
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nextProvider>
  </React.StrictMode>
);
