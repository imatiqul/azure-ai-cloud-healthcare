import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { Button } from '@healthcare/design-system';
import { useColorMode } from '@healthcare/design-system';
import { useAuth } from '@healthcare/auth-client';
import { SidebarMenuButton } from './Sidebar';
import { useTranslation } from 'react-i18next';

export function TopNav() {
  const { session, isAuthenticated, signIn, signOut } = useAuth();
  const { mode, toggleMode } = useColorMode();
  const { t } = useTranslation();

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ justifyContent: 'space-between' }}>
        <Stack direction="row" alignItems="center">
          <SidebarMenuButton />
          <Typography variant="body2" fontWeight={500} color="text.secondary">
            {t('topnav.platformTitle')}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title={mode === 'dark' ? t('topnav.lightMode') : t('topnav.darkMode')}>
            <IconButton size="small" onClick={toggleMode} aria-label="toggle colour mode">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          {isAuthenticated && session ? (
            <>
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                {session.name.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="body2">{session.name}</Typography>
              <Button variant="ghost" size="sm" onClick={signOut}>{t('topnav.signOut')}</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={signIn}>{t('topnav.signIn')}</Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
