import { useEffect, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus, BrowserAuthError } from '@azure/msal-browser';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { passwordResetRequest } from '../auth/msalConfig';

/**
 * Auth callback page — handles the redirect from Azure AD B2C after login.
 *
 * Route: /auth/callback (must match the redirectUri registered in B2C app registration)
 *
 * MSAL's MsalProvider calls handleRedirectPromise() on mount automatically.
 * This component renders a loading spinner while that's in-flight and redirects
 * back to the portal root when complete.
 *
 * Special case: If B2C sends AADB2C90118 (password reset requested), we
 * automatically re-trigger the password-reset policy.
 */
export function AuthCallback() {
  const { instance, inProgress } = useMsal();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || inProgress !== InteractionStatus.None) return;
    handled.current = true;

    // handleRedirectPromise is called automatically by MsalProvider on mount.
    // If we are on the callback route after a successful redirect, accounts are
    // now populated. Navigate the user to the portal home.
    const accounts = instance.getAllAccounts();
    if (accounts.length > 0) {
      // Remove the /auth/callback segment and go to the portal root
      window.location.replace(window.location.origin);
    }
  }, [instance, inProgress]);

  // Handle password-reset redirect (B2C sends error=access_denied + error_description contains AADB2C90118)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorDesc = params.get('error_description') ?? '';
    if (errorDesc.includes('AADB2C90118')) {
      // User clicked "Forgot password?" — redirect to the password-reset policy
      instance.loginRedirect(passwordResetRequest).catch(console.error);
    }
  }, [instance]);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '100vh' }}>
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Completing sign-in…
      </Typography>
    </Stack>
  );
}
