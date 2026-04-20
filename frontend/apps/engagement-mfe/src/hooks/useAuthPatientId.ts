import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { b2cConfigured, patientPortalScopes } from '../auth/msalConfig';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface AuthPatientIdResult {
  patientId: string | null;
  /** True while the token / identity lookup is in progress. */
  loading: boolean;
  /** Error message if the lookup failed. */
  error: string | null;
  /** True when the user is authenticated via B2C. */
  isAuthenticated: boolean;
}

/**
 * Resolves the current B2C-authenticated patient's internal HealthQ patient ID.
 *
 * Flow:
 *   1. Acquire B2C token (silent → interactive fallback).
 *   2. POST /api/v1/identity/patients/register with the Entra sub + profile.
 *   3. The IdP sub is stored as ExternalId; the response returns the internal Id.
 *
 * When B2C is not configured (VITE_B2C_CLIENT_ID not set) returns
 * { patientId: null, loading: false, isAuthenticated: false }.
 */
export function useAuthPatientId(): AuthPatientIdResult {
  const { instance, accounts } = useMsal();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = accounts[0] ?? null;
  const isAuthenticated = Boolean(account);

  useEffect(() => {
    if (!b2cConfigured || !account) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Acquire token silently; triggers interactive redirect on failure.
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: patientPortalScopes,
          account,
        });

        const accessToken = tokenResponse.accessToken;

        // Register (idempotent) or retrieve the patient's internal ID.
        const res = await fetch(`${API_BASE}/api/v1/identity/patients/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            externalId: account.localAccountId,
            email: account.username,
            fullName: account.name ?? account.username,
          }),
        });

        if (!res.ok) {
          throw new Error(`Identity register returned ${res.status}`);
        }

        const data: { id: string } = await res.json();
        if (!cancelled) setPatientId(data.id);
      } catch (err: unknown) {
        if (!cancelled) {
          // InteractionRequiredAuthError means silent token renewal failed (session expired).
          // Redirect to B2C for interactive login to get a fresh token.
          if (err instanceof InteractionRequiredAuthError) {
            await instance.acquireTokenRedirect({ scopes: patientPortalScopes });
            return;
          }
          setError(err instanceof Error ? err.message : 'Authentication failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [instance, account]);

  return { patientId, loading, isAuthenticated, error };
}
