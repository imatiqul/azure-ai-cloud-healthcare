import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import Chip from '@mui/material/Chip';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Button } from '@healthcare/design-system';
import { useColorMode } from '@healthcare/design-system';
import { useAuth } from '@healthcare/auth-client';
import { SidebarMenuButton } from './Sidebar';
import { useTranslation } from 'react-i18next';
import { ContextualHelpPanel } from './ContextualHelpPanel'; // Phase 37
import { WhatsNewPanel, useWhatsNewBadge } from './WhatsNewPanel'; // Phase 38
import { PatientQuickSearch } from './PatientQuickSearch'; // Phase 47

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface LiveAlert {
  id:       string;
  title:    string;
  subtitle: string;
  severity: 'error' | 'warning' | 'info';
  href:     string;
  icon:     React.ReactNode;
}

async function fetchAlerts(): Promise<LiveAlert[]> {
  const alerts: LiveAlert[] = [];
  try {
    const [denialsRes, triageRes, deliveryRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/v1/revenue/denials/analytics`, { signal: AbortSignal.timeout(10_000) }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/v1/agents/triage?top=50`, { signal: AbortSignal.timeout(10_000) }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/v1/notifications/analytics/delivery`, { signal: AbortSignal.timeout(10_000) }).then(r => r.ok ? r.json() : null),
    ]);

    const denials  = denialsRes.status  === 'fulfilled' ? denialsRes.value  : null;
    const triage   = triageRes.status   === 'fulfilled' ? triageRes.value   : null;
    const delivery = deliveryRes.status === 'fulfilled' ? deliveryRes.value : null;

    if (denials?.nearDeadlineCount > 0) {
      alerts.push({
        id:       'denials-deadline',
        title:    `${denials.nearDeadlineCount} claim denial${denials.nearDeadlineCount > 1 ? 's' : ''} near deadline`,
        subtitle: `${denials.openCount ?? 0} open • Appeal before deadline to avoid write-off`,
        severity: 'error',
        href:     '/revenue',
        icon:     <WarningAmberIcon fontSize="small" />,
      });
    }
    if (denials?.openCount > 5) {
      alerts.push({
        id:       'denials-open',
        title:    `${denials.openCount} open claim denials`,
        subtitle: `Overturn rate: ${Math.round((denials.overTurnRate ?? 0) * 100)}%`,
        severity: 'warning',
        href:     '/revenue',
        icon:     <ErrorOutlineIcon fontSize="small" />,
      });
    }

    const pending = Array.isArray(triage) ? triage.filter((t: any) => t.status === 'Pending' || t.urgencyLevel === 'P1' || t.urgencyLevel === 'P2').length : 0;
    if (pending > 0) {
      alerts.push({
        id:       'triage-pending',
        title:    `${pending} high-priority triage session${pending > 1 ? 's' : ''} pending`,
        subtitle: 'Requires immediate clinical review',
        severity: 'error',
        href:     '/triage',
        icon:     <SmartToyIcon fontSize="small" />,
      });
    }

    if (delivery && (delivery.failureRate ?? 0) > 0.1) {
      const failedCount = delivery.failed ?? 0;
      alerts.push({
        id:       'delivery-failures',
        title:    `${failedCount} notification${failedCount !== 1 ? 's' : ''} failed to deliver`,
        subtitle: `Delivery rate: ${Math.round((delivery.deliveryRate ?? 0) * 100)}%`,
        severity: 'warning',
        href:     '/patient-portal',
        icon:     <NotificationsOutlinedIcon fontSize="small" />,
      });
    }
  } catch {
    // silent — alerts degrade gracefully
  }
  return alerts;
}

interface TopNavProps {
  onOpenSearch?: () => void;
}

export function TopNav({ onOpenSearch }: TopNavProps) {
  const navigate = useNavigate();
  const { session, isAuthenticated, signIn, signOut } = useAuth();
  const { mode, toggleMode } = useColorMode();
  const { t } = useTranslation();
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor]       = useState<null | HTMLElement>(null);
  const [alerts, setAlerts]                 = useState<LiveAlert[]>([]);
  const [helpOpen, setHelpOpen]             = useState(false); // Phase 37
  const [whatsNewOpen, setWhatsNewOpen]     = useState(false); // Phase 38
  const whatsNewCount                       = useWhatsNewBadge();  // Phase 38

  const openUserMenu  = (e: React.MouseEvent<HTMLElement>) => setUserMenuAnchor(e.currentTarget);
  const closeUserMenu = () => setUserMenuAnchor(null);
  const openNotif     = (e: React.MouseEvent<HTMLElement>) => setNotifAnchor(e.currentTarget);
  const closeNotif    = () => setNotifAnchor(null);

  const handleSignOut = () => { closeUserMenu(); signOut(); };

  const loadAlerts = useCallback(() => {
    if (isAuthenticated) fetchAlerts().then(setAlerts);
  }, [isAuthenticated]);

  useEffect(() => {
    loadAlerts();
    const id = setInterval(loadAlerts, 60_000);
    return () => clearInterval(id);
  }, [loadAlerts]);

  const goToAlert = (alert: LiveAlert) => {
    closeNotif();
    navigate(alert.href);
  };

  return (
    <>
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.drawer - 1 }}>
      <Toolbar variant="dense" sx={{ justifyContent: 'space-between', minHeight: 56 }}>

        {/* ── Left ── */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <SidebarMenuButton />
          <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {t('topnav.platformTitle', 'HealthQ Copilot')}
          </Typography>
        </Stack>

        {/* ── Centre — search bar (desktop) ── */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flex: '0 1 340px' }}>
          <Box
            onClick={onOpenSearch}
            role="button"
            aria-label="Open command palette"
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              width: '100%', px: 1.5, py: 0.75,
              borderRadius: 2, bgcolor: 'action.hover',
              cursor: 'pointer', border: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.selected' },
              transition: 'background 0.15s',
            }}
          >
            <SearchIcon fontSize="small" sx={{ color: 'text.disabled', fontSize: 16 }} />
            <Typography variant="body2" color="text.disabled" sx={{ flex: 1, userSelect: 'none', fontSize: '0.8rem' }}>
              Search pages and actions…
            </Typography>
            <Chip label="Ctrl K" size="small" variant="outlined" sx={{ fontSize: '0.62rem', height: 18, color: 'text.disabled', borderColor: 'divider' }} />
          </Box>
        </Box>

        {/* ── Right ── */}
        <Stack direction="row" alignItems="center" spacing={0.5}>

          {/* Mobile search button */}
          <Tooltip title="Search (Ctrl+K)">
            <IconButton size="small" onClick={onOpenSearch} aria-label="Search" sx={{ display: { md: 'none' } }}>
              <SearchIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Patient quick search (Phase 47) */}
          <PatientQuickSearch />

          {/* Colour-mode toggle */}
          <Tooltip title={mode === 'dark' ? t('topnav.lightMode', 'Light mode') : t('topnav.darkMode', 'Dark mode')}>
            <IconButton size="small" onClick={toggleMode} aria-label="toggle colour mode">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Contextual help */}
          <Tooltip title="Help">
            <IconButton size="small" onClick={() => setHelpOpen(true)} aria-label="Open help panel">
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* What's New */}
          <Tooltip title="What's New">
            <IconButton size="small" onClick={() => setWhatsNewOpen(true)} aria-label="Open what's new panel">
              <Badge
                badgeContent={whatsNewCount || null}
                color="primary"
                sx={{ '& .MuiBadge-badge': { fontSize: 9, minWidth: 16, height: 16 } }}
              >
                <AutoAwesomeIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          {isAuthenticated && session ? (
            <>
              {/* Live notification bell */}
              <Tooltip title={alerts.length ? `${alerts.length} alert${alerts.length > 1 ? 's' : ''}` : 'No alerts'}>
                <IconButton size="small" onClick={openNotif} aria-label="Notifications">
                  <Badge
                    badgeContent={alerts.length || null}
                    color={alerts.some(a => a.severity === 'error') ? 'error' : 'warning'}
                    sx={{ '& .MuiBadge-badge': { fontSize: 9, minWidth: 16, height: 16 } }}
                  >
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
                PaperProps={{ sx: { width: 340, mt: 0.5 } }}
              >
                <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" fontWeight={700}>Alerts</Typography>
                  {alerts.length > 0 && (
                    <Chip label={`${alerts.length} active`} size="small" color={alerts.some(a => a.severity === 'error') ? 'error' : 'warning'} sx={{ height: 20, fontSize: '0.65rem' }} />
                  )}
                </Box>
                {alerts.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">All clear — no active alerts</Typography>
                  </Box>
                ) : (
                  alerts.map(alert => (
                    <MenuItem
                      key={alert.id}
                      onClick={() => goToAlert(alert)}
                      sx={{ py: 1.25, gap: 1.5, alignItems: 'flex-start', borderLeft: 3, borderColor: alert.severity === 'error' ? 'error.main' : 'warning.main' }}
                    >
                      <Box sx={{ color: alert.severity === 'error' ? 'error.main' : 'warning.main', mt: 0.25 }}>
                        {alert.icon}
                      </Box>
                      <Box>
                        <Typography variant="body2" fontWeight={600} lineHeight={1.3}>{alert.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{alert.subtitle}</Typography>
                      </Box>
                    </MenuItem>
                  ))
                )}
                <Divider />
                <Box sx={{ px: 2, py: 1, textAlign: 'center' }}>
                  <Typography variant="caption" color="primary.main" sx={{ cursor: 'pointer' }} onClick={() => { closeNotif(); navigate('/notifications'); }}>
                    View all notifications →
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
                <MenuItem onClick={() => { closeUserMenu(); navigate('/admin/profile'); }}>
                  <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
                  <Typography variant="body2">Profile</Typography>
                </MenuItem>
                <MenuItem onClick={() => { closeUserMenu(); navigate('/admin'); }}>
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
    <ContextualHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    <WhatsNewPanel open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </>
  );
}
