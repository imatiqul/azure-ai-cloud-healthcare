import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@healthcare/design-system';
import { useAuth } from '@healthcare/auth-client';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import SecurityIcon from '@mui/icons-material/Security';

function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) return 'Unknown';
  return new Date(expiresAt * 1000).toLocaleString();
}

export default function UserProfile() {
  const { session, isAuthenticated, signOut, signIn } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', py: 4 }}>
        <Alert severity="info" action={
          <Button variant="ghost" size="sm" onClick={signIn}>Sign in</Button>
        }>
          You are not signed in. Please sign in to view your profile.
        </Alert>
      </Box>
    );
  }

  const name  = (session as any)?.name   ?? 'HealthQ User';
  const email = (session as any)?.email  ?? '—';
  const role  = (session as any)?.role   ?? (session as any)?.roles?.[0] ?? '—';
  const exp   = (session as any)?.exp;

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', py: 1 }}>
      <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
        <AccountCircleOutlinedIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>My Profile</Typography>
      </Stack>

      {/* Identity card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={3}>
            <Avatar
              sx={{
                width: 72,
                height: 72,
                bgcolor: 'primary.main',
                fontSize: '1.5rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials(name)}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h6" fontWeight={700}>{name}</Typography>
              <Typography variant="body2" color="text.secondary" mb={1}>{email}</Typography>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip label="Authenticated" color="success" size="small" />
                {role && role !== '—' && <Chip label={role} size="small" variant="outlined" />}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Session info */}
      <Card sx={{ mb: 3 }}>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" alignItems="center" gap={1}>
              <SecurityIcon fontSize="small" color="primary" />
              Session Information
            </Stack>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={1.5}>
            {[
              { label: 'Email',           value: email },
              { label: 'Role',            value: role },
              { label: 'Session expires', value: formatExpiry(exp) },
            ].map(({ label, value }) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="body2">{value}</Typography>
                <Divider sx={{ mt: 1 }} />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card sx={{ mb: 3 }}>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={1.5}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin')}
              aria-label="go to settings"
            >
              <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
              Platform Settings
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={signOut}
              aria-label="sign out"
            >
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
              Sign Out
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary">
        Account provisioned by your platform administrator. For access changes contact your HealthQ admin.
      </Typography>
    </Box>
  );
}
