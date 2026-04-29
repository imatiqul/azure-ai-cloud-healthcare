import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useAuth, isAuthConfigured } from '@healthcare/auth-client';

/**
 * Triggers the MSAL login redirect on mount. If auth is not configured (demo
 * mode) the user is sent straight to the dashboard.
 */
export default function SignInPage() {
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthConfigured()) {
      navigate('/', { replace: true });
      return;
    }
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }
    signIn();
  }, [signIn, isAuthenticated, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
      <CircularProgress />
      <Typography variant="body1">Redirecting to sign-in…</Typography>
    </Box>
  );
}
