import { useCallback, useRef, useEffect } from 'react';
import { useSession } from './client';

/**
 * Returns a `fetch` wrapper that automatically injects an `Authorization: Bearer`
 * header when the user is authenticated.  Safe to use inside `setInterval` callbacks
 * because it stores the latest token in a ref rather than closing over stale state.
 */
export function useAuthFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  const { session } = useSession();
  const tokenRef = useRef<string | undefined>(session?.accessToken);

  useEffect(() => {
    tokenRef.current = session?.accessToken;
  }, [session?.accessToken]);

  return useCallback((url: string, init?: RequestInit): Promise<Response> => {
    const token = tokenRef.current;
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(url, {
      ...init,
      headers: { ...authHeaders, ...init?.headers },
    });
  }, []);
}
