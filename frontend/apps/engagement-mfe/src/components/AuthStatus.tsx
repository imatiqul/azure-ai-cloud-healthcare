import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { loginScopes } from '../auth/msalConfig';

/**
 * Displays the current B2C auth state and provides sign-in / sign-out controls.
 *
 * - Unauthenticated: shows a "Sign in" button that triggers PKCE loginRedirect
 * - Authenticated: shows the user's name and a "Sign out" chip
 */
export function AuthStatus() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const account = accounts[0] ?? null;
  const displayName = account?.name ?? account?.username ?? 'Patient';

  function handleSignIn() {
    instance.loginRedirect({ scopes: loginScopes }).catch(console.error);
  }

  function handleSignOut() {
    instance.logoutRedirect({
      account,
      postLogoutRedirectUri: window.location.origin,
    }).catch(console.error);
  }

  if (!isAuthenticated) {
    return (
      <Button
        variant="outlined"
        size="small"
        onClick={handleSignIn}
        sx={{ textTransform: 'none', borderRadius: 6 }}
      >
        Sign in
      </Button>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={account?.username ?? ''}>
        <Chip
          label={displayName}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ maxWidth: 160, fontWeight: 500 }}
        />
      </Tooltip>
      <Button
        variant="text"
        size="small"
        onClick={handleSignOut}
        sx={{ textTransform: 'none', color: 'text.secondary' }}
      >
        Sign out
      </Button>
    </Stack>
  );
}
