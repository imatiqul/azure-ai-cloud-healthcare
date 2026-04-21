import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// ── Bundled translations (tree-shaken per language) ─────────────────────────
import en from '../../../../locales/en/translation.json';
import es from '../../../../locales/es/translation.json';
import fr from '../../../../locales/fr/translation.json';
import ar from '../../../../locales/ar/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already XSS-safe
    detection: {
      // Detect in order: query string ?lng=, cookie, browser language
      order: ['querystring', 'cookie', 'navigator', 'htmlTag'],
      caches: ['cookie'],
    },
  });

export default i18n;
