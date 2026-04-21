import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { Button } from '@healthcare/design-system';
import { useColorMode } from '@healthcare/design-system';
import { useAuth } from '@healthcare/auth-client';
import { SidebarMenuButton } from './Sidebar';
import { useTranslation } from 'react-i18next';

export function TopNav() {
  const { session, isAuthenticated, signIn, signOut } = useAuth();
  const { mode, toggleMode } = useColorMode();
  const { t } = useTranslation();
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor]       = useState<null | HTMLElement>(null);

  const openUserMenu  = (e: React.MouseEvent<HTMLElement>) => setUserMenuAnchor(e.currentTarget);
  const closeUserMenu = () => setUserMenuAnchor(null);
  const openNotif     = (e: React.MouseEvent<HTMLElement>) => setNotifAnchor(e.currentTarget);
  const closeNotif    = () => setNotifAnchor(null);

  const handleSignOut = () => { closeUserMenu(); signOut(); };

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.drawer - 1 }}>
      <Toolbar variant="dense" sx={{ justifyContent: 'space-between', minHeight: 56 }}>

        {/* ── Left ── */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <SidebarMenuButton />
          <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {t('topnav.platformTitle', 'HealthQ Copilot')}
          </Typography>
        </Stack>

        {/* ── Right ── */}
        <Stack direction="row" alignItems="center" spacing={0.5}>

          {/* Colour-mode toggle */}
          <Tooltip title={mode === 'dark' ? t('topnav.lightMode', 'Light mode') : t('topnav.darkMode', 'Dark mode')}>
            <IconButton size="small" onClick={toggleMode} aria-label="toggle colour mode">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {isAuthenticated && session ? (
            <>
              {/* Notification bell */}
              <Tooltip title="Notifications">
                <IconButton size="small" onClick={openNotif} aria-label="Notifications">
                  <Badge badgeContent={3} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 9, minWidth: 16, height: 16 } }}>
                    <NotificationsOutlinedIcon fontSize="small" />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={notifAnchor}
                open={Boolean(notifAnchor)}
                onClose={closeNotif}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{ sx: { width: 320, mt: 0.5 } }}
              >
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                </Box>
                <MenuItem onClick={closeNotif} sx={{ py: 1.5, flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                  <Typography variant="body2" fontWeight={600}>Triage escalation — Room 4B</Typography>
                  <Typography variant="caption" color="text.secondary">Patient P1 requires immediate review</Typography>
                </MenuItem>
                <MenuItem onClick={closeNotif} sx={{ py: 1.5, flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                  <Typography variant="body2" fontWeight={600}>Lab results ready</Typography>
                  <Typography variant="caption" color="text.secondary">CBC results for J. Smith available</Typography>
                </MenuItem>
                <MenuItem onClick={closeNotif} sx={{ py: 1.5, flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                  <Typography variant="body2" fontWeight={600}>Appointment reminder</Typography>
                  <Typography variant="caption" color="text.secondary">3 upcoming appointments in the next hour</Typography>
                </MenuItem>
                <Divider />
                <Box sx={{ px: 2, py: 1, textAlign: 'center' }}>
                  <Typography variant="caption" color="primary.main" sx={{ cursor: 'pointer' }} onClick={closeNotif}>
                    View all notifications
                  </Typography>
                </Box>
              </Menu>

              {/* User avatar menu */}
              <Tooltip title="Account">
                <IconButton
                  size="small"
                  onClick={openUserMenu}
                  aria-label="User menu"
                  sx={{ p: 0.25 }}
                >
                  <Avatar sx={{ width: 30, height: 30, fontSize: '0.8rem', bgcolor: 'primary.main', fontWeight: 700 }}>
                    {session.name.charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={closeUserMenu}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{ sx: { width: 220, mt: 0.5 } }}
              >
                {/* User info header */}
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" fontWeight={700} noWrap>{session.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {(session as any).email ?? 'clinician@healthq.ai'}
                  </Typography>
                </Box>
                <MenuItem onClick={closeUserMenu}>
                  <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
                  <Typography variant="body2">Profile</Typography>
                </MenuItem>
                <MenuItem onClick={closeUserMenu}>
                  <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
                  <Typography variant="body2">Settings</Typography>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleSignOut}>
                  <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
                  <Typography variant="body2" color="error.main">{t('topnav.signOut', 'Sign out')}</Typography>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={signIn}>{t('topnav.signIn', 'Sign in')}</Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
