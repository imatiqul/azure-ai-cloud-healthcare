import { installDemoFetchInterceptor } from './lib/demoFetchInterceptor';
// Install before any component mounts so every fetch() call gets demo data
installDemoFetchInterceptor();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@healthcare/design-system';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nextProvider>
  </React.StrictMode>
);
