import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  EventType,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type EventMessage,
  type PublicClientApplication,
} from '@azure/msal-browser';
import type { UserSession } from './types';
import { authConfig, isAuthConfigured } from './auth-config';
import { getMsalInstance } from './msalInstance';

interface AuthContextValue {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
}

const defaultContext: AuthContextValue = {
  session: null,
  isAuthenticated: false,
  isLoading: false,
  signIn: () => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[auth-client] signIn() called but VITE_AZURE_AD_CLIENT_ID is not configured (demo mode).');
    }
  },
  signOut: () => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[auth-client] signOut() called but VITE_AZURE_AD_CLIENT_ID is not configured (demo mode).');
    }
  },
};

export const AuthContext = createContext<AuthContextValue>(defaultContext);

export function useSession(): { session: UserSession | null; isAuthenticated: boolean } {
  const ctx = useContext(AuthContext);
  return { session: ctx.session, isAuthenticated: ctx.isAuthenticated };
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** Imperative helpers (kept for backward compatibility). */
export function signIn(): void {
  void getMsalInstance().then((instance) => {
    if (instance) {
      void instance.loginRedirect({ scopes: authConfig.scopes });
    } else if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[auth-client] signIn() called but auth is not configured.');
    }
  });
}

export function signOut(): void {
  void getMsalInstance().then((instance) => {
    if (instance) {
      void instance.logoutRedirect({ postLogoutRedirectUri: authConfig.postLogoutRedirectUri });
    } else if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[auth-client] signOut() called but auth is not configured.');
    }
  });
}

function inferRole(claims: Record<string, unknown> | undefined): UserSession['role'] {
  const roles = (claims?.roles ?? []) as string[];
  if (roles.includes('Admin') || roles.includes('PlatformAdmin')) return 'Admin';
  if (roles.includes('Clinician') || roles.includes('Practitioner')) return 'Practitioner';
  return 'Patient';
}

function buildSession(account: AccountInfo, accessToken: string, expiresOn: Date | null): UserSession {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  return {
    id: account.localAccountId || account.homeAccountId,
    name: account.name ?? (claims.name as string | undefined) ?? account.username,
    email: (claims.email as string | undefined) ?? account.username,
    role: inferRole(claims),
    accessToken,
    exp: expiresOn ? Math.floor(expiresOn.getTime() / 1000) : undefined,
  };
}

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * `AuthProvider` boots the MSAL client (when configured), processes redirect
 * responses, acquires an API access token, and exposes the result through
 * `AuthContext`. When `VITE_AZURE_AD_CLIENT_ID` is not set this component is a
 * no-op pass-through that preserves the existing demo experience.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const enabled = isAuthConfigured();
  const [instance, setInstance] = useState<PublicClientApplication | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);

  // Bootstrap MSAL.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getMsalInstance().then(async (msal) => {
      if (cancelled || !msal) return;
      try {
        const result = await msal.handleRedirectPromise();
        if (result?.account) {
          msal.setActiveAccount(result.account);
        } else {
          const accounts = msal.getAllAccounts();
          if (accounts.length > 0 && !msal.getActiveAccount()) {
            msal.setActiveAccount(accounts[0]);
          }
        }
        setInstance(msal);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[auth-client] handleRedirectPromise failed', err);
        setInstance(msal);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Acquire token whenever the active account changes.
  const refreshToken = useCallback(async (msal: PublicClientApplication) => {
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
    if (!account) {
      setSession(null);
      setIsLoading(false);
      return;
    }
    try {
      const result: AuthenticationResult = await msal.acquireTokenSilent({
        scopes: authConfig.scopes,
        account,
      });
      setSession(buildSession(account, result.accessToken, result.expiresOn));
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        await msal.acquireTokenRedirect({ scopes: authConfig.scopes, account });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[auth-client] acquireTokenSilent failed', err);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!instance) return;
    void refreshToken(instance);
    const callbackId = instance.addEventCallback((message: EventMessage) => {
      if (
        message.eventType === EventType.LOGIN_SUCCESS ||
        message.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
        message.eventType === EventType.ACCOUNT_ADDED ||
        message.eventType === EventType.ACCOUNT_REMOVED ||
        message.eventType === EventType.LOGOUT_SUCCESS
      ) {
        if (message.payload && 'account' in message.payload && (message.payload as { account?: AccountInfo }).account) {
          instance.setActiveAccount((message.payload as { account: AccountInfo }).account);
        }
        void refreshToken(instance);
      }
    });
    return () => {
      if (callbackId) instance.removeEventCallback(callbackId);
    };
  }, [instance, refreshToken]);

  const value = useMemo<AuthContextValue>(() => {
    if (!enabled) return defaultContext;
    return {
      session,
      isAuthenticated: !!session,
      isLoading,
      signIn: () => {
        if (instance) void instance.loginRedirect({ scopes: authConfig.scopes });
      },
      signOut: () => {
        if (instance) void instance.logoutRedirect({ postLogoutRedirectUri: authConfig.postLogoutRedirectUri });
      },
    };
  }, [enabled, instance, session, isLoading]);

  return createElement(AuthContext.Provider, { value }, children);
}
