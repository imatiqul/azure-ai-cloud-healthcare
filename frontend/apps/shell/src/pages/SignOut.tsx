import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useAuth, isAuthConfigured } from '@healthcare/auth-client';

/** Triggers the MSAL logout redirect on mount, or returns to home in demo mode. */
export default function SignOutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthConfigured()) {
      navigate('/', { replace: true });
      return;
    }
    signOut();
  }, [signOut, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
      <CircularProgress />
      <Typography variant="body1">Signing out…</Typography>
    </Box>
  );
}
