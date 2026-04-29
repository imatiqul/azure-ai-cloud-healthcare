export interface AuthConfig {
  /** OIDC authority, e.g. https://login.microsoftonline.com/{tenantId}. */
  authority: string;
  /** Entra application (client) id. Empty string disables real auth (demo mode). */
  clientId: string;
  /** Where Entra redirects after the auth flow. Defaults to current origin. */
  redirectUri: string;
  /** Where to redirect after sign-out. Defaults to current origin. */
  postLogoutRedirectUri: string;
  /** Scopes requested for the app's API access token. */
  scopes: string[];
}

const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

/**
 * Build the auth configuration from Vite-injected env vars.
 *  - `VITE_AZURE_AD_CLIENT_ID` — Entra app client id (REQUIRED to enable real auth)
 *  - `VITE_AZURE_AD_ISSUER`    — full authority url
 *  - `VITE_AZURE_AD_AUDIENCE`  — app id URI (`api://{clientId}`) used for the access-token scope
 *  - `VITE_REDIRECT_URI`       — optional explicit redirect URI
 */
export const authConfig: AuthConfig = (() => {
  const clientId = import.meta.env?.VITE_AZURE_AD_CLIENT_ID ?? '';
  const audience = import.meta.env?.VITE_AZURE_AD_AUDIENCE ?? (clientId ? `api://${clientId}` : '');
  return {
    authority: import.meta.env?.VITE_AZURE_AD_ISSUER ?? '',
    clientId,
    redirectUri: import.meta.env?.VITE_REDIRECT_URI ?? fallbackOrigin,
    postLogoutRedirectUri: import.meta.env?.VITE_POST_LOGOUT_REDIRECT_URI ?? fallbackOrigin,
    scopes: audience ? [`${audience}/.default`] : ['openid', 'profile', 'email'],
  };
})();

export const isAuthConfigured = (): boolean => Boolean(authConfig.clientId && authConfig.authority);
