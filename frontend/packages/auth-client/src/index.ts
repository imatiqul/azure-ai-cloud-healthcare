export { authConfig, isAuthConfigured } from './auth-config';
export type { AuthConfig } from './auth-config';
export { useSession, useAuth, signIn, signOut, AuthContext, AuthProvider } from './client';
export type { UserSession } from './types';
export { useAuthFetch } from './fetchWithAuth';
export { getMsalInstance } from './msalInstance';
