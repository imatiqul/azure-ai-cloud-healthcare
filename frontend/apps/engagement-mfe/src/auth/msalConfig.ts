import { PublicClientApplication, Configuration, LogLevel, BrowserCacheLocation } from '@azure/msal-browser';

/**
 * MSAL configuration for Azure AD B2C patient authentication.
 *
 * Required environment variables (set in .env.local or Azure Static Web Apps app settings):
 *   VITE_B2C_CLIENT_ID       — App (client) ID of the healthq-engagement-mfe registration in B2C
 *   VITE_B2C_AUTHORITY       — Sign-up/sign-in policy authority URL
 *                               e.g. https://healthqcopilotdev.b2clogin.com/healthqcopilotdev.onmicrosoft.com/B2C_1_signup_signin/v2.0
 *   VITE_B2C_PASSWORD_RESET  — Password-reset policy authority URL (optional, defaults to authority)
 *   VITE_B2C_REDIRECT_URI    — Redirect URI registered in B2C app (defaults to window.location.origin + /auth/callback)
 *   VITE_B2C_API_SCOPE       — Custom API scope exposed by healthq-api registration
 *                               e.g. https://healthqcopilotdev.onmicrosoft.com/healthq-api/patient.access
 *
 * When VITE_B2C_CLIENT_ID is not set the app operates in unauthenticated mode.
 */
const clientId = import.meta.env.VITE_B2C_CLIENT_ID as string | undefined;
const authority = import.meta.env.VITE_B2C_AUTHORITY as string | undefined;
const passwordResetAuthority = (import.meta.env.VITE_B2C_PASSWORD_RESET as string | undefined) ?? authority;
const redirectUri =
  (import.meta.env.VITE_B2C_REDIRECT_URI as string | undefined) ??
  `${window.location.origin}/auth/callback`;

export const b2cConfigured = Boolean(clientId && authority);

/**
 * Custom API scope for acquiring access tokens.
 * Falls back to openid profile only when not explicitly configured.
 */
const apiScope = import.meta.env.VITE_B2C_API_SCOPE as string | undefined;

/** Scopes for interactive login (ID token + consent). */
export const loginScopes: string[] = ['openid', 'profile', 'offline_access'];

/** Scopes for silent token acquisition — includes the backend API scope. */
export const patientPortalScopes: string[] = apiScope
  ? ['openid', 'profile', 'offline_access', apiScope]
  : ['openid', 'profile', 'offline_access'];

const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? 'not-configured',
    // authority is the sign-up/sign-in policy; MSAL uses PKCE (S256) for all auth-code flows
    authority: authority ?? 'https://login.microsoftonline.com/common',
    redirectUri,
    postLogoutRedirectUri: window.location.origin,
    knownAuthorities: authority
      ? [new URL(authority).hostname]
      : [],
    // Navigate to the originating page after redirect instead of redirectUri
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps auth state for the tab only (recommended for PHI apps)
    cacheLocation: BrowserCacheLocation.SessionStorage,
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error('[MSAL]', message);
        else if (level === LogLevel.Warning) console.warn('[MSAL]', message);
      },
      piiLoggingEnabled: false,
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Password-reset authority. Used by the "Forgot password?" link.
 * Triggers the B2C_1_password_reset policy instead of signup_signin.
 */
export const passwordResetRequest = {
  authority: passwordResetAuthority,
  scopes: loginScopes,
};

