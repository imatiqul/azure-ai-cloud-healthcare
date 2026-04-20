import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MicIcon from '@mui/icons-material/Mic';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import PersonIcon from '@mui/icons-material/Person';
import { useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';

// ── Sidebar context (lets TopNav control the mobile drawer) ──────────────────

interface SidebarContextValue {
  mobileOpen: boolean;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  mobileOpen: false,
  toggleMobile: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleMobile = () => setMobileOpen(prev => !prev);
  return (
    <SidebarContext.Provider value={{ mobileOpen, toggleMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

// ── Navigation items ─────────────────────────────────────────────────────────

const navItems = [
  { href: '/',                 labelKey: 'nav.dashboard',  icon: <DashboardIcon /> },
  { href: '/voice',            labelKey: 'nav.triage',     icon: <MicIcon /> },
  { href: '/triage',           labelKey: 'nav.triage',     icon: <SmartToyIcon /> },
  { href: '/encounters',       labelKey: 'nav.documents',  icon: <MedicalInformationIcon /> },
  { href: '/scheduling',       labelKey: 'nav.scheduling', icon: <CalendarMonthIcon /> },
  { href: '/population-health',labelKey: 'nav.population', icon: <TrendingUpIcon /> },
  { href: '/revenue',          labelKey: 'nav.revenue',    icon: <AttachMoneyIcon /> },
  { href: '/patient-portal',   labelKey: 'nav.consent',    icon: <PersonIcon /> },
];

// ── Shared nav content ────────────────────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <Box sx={{ width: 260, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" fontWeight="bold" color="primary">
            Healthcare AI
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Clinical Platform
          </Typography>
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <List sx={{ flex: 1, px: 1, pt: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.href}
            component={Link}
            to={item.href}
            selected={pathname === item.href}
            onClick={onClose}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={t(item.labelKey)} primaryTypographyProps={{ fontSize: 14 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

// ── Public Sidebar component ──────────────────────────────────────────────────

export function Sidebar() {
  const theme   = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mobileOpen, toggleMobile } = useSidebar();

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={toggleMobile}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: 260 } }}
      >
        <SidebarContent onClose={toggleMobile} />
      </Drawer>
    );
  }

  return (
    <Box
      component="aside"
      sx={{
        width: 260,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SidebarContent />
    </Box>
  );
}

// ── Hamburger button — rendered inside TopNav on mobile ──────────────────────

export function SidebarMenuButton() {
  const { toggleMobile } = useSidebar();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!isMobile) return null;

  return (
    <IconButton
      size="small"
      onClick={toggleMobile}
      aria-label="Open menu"
      sx={{ mr: 1 }}
    >
      <MenuIcon />
    </IconButton>
  );
}
