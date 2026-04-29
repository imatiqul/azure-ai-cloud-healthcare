import { PublicClientApplication, type Configuration, type AccountInfo } from '@azure/msal-browser';
import { authConfig, isAuthConfigured } from './auth-config';

let cachedInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

/**
 * Lazily create and initialize the MSAL `PublicClientApplication` singleton.
 * Returns `null` when auth is not configured (demo mode).
 */
export async function getMsalInstance(): Promise<PublicClientApplication | null> {
  if (!isAuthConfigured()) return null;
  if (cachedInstance) return cachedInstance;
  if (initPromise) return initPromise;

  const configuration: Configuration = {
    auth: {
      clientId: authConfig.clientId,
      authority: authConfig.authority,
      redirectUri: authConfig.redirectUri,
      postLogoutRedirectUri: authConfig.postLogoutRedirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };

  initPromise = (async () => {
    const instance = new PublicClientApplication(configuration);
    await instance.initialize();
    cachedInstance = instance;
    return instance;
  })();

  return initPromise;
}

export type { AccountInfo };
