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
import Tooltip from '@mui/material/Tooltip';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MicIcon from '@mui/icons-material/Mic';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BarChartIcon from '@mui/icons-material/BarChart';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PolicyIcon from '@mui/icons-material/Policy';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RateReviewIcon from '@mui/icons-material/RateReview';
import BadgeIcon from '@mui/icons-material/Badge';
import ApartmentIcon from '@mui/icons-material/Apartment';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import HistoryIcon from '@mui/icons-material/History';
import { useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';

// ── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED = 64;

// ── Sidebar context ──────────────────────────────────────────────────────────

interface SidebarContextValue {
  mobileOpen: boolean;
  collapsed: boolean;
  toggleMobile: () => void;
  toggleCollapse: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  mobileOpen: false,
  collapsed: false,
  toggleMobile: () => {},
  toggleCollapse: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [collapsed,  setCollapsed]    = useState(false);
  const toggleMobile  = () => setMobileOpen(prev => !prev);
  const toggleCollapse = () => setCollapsed(prev => !prev);
  return (
    <SidebarContext.Provider value={{ mobileOpen, collapsed, toggleMobile, toggleCollapse }}>
      {children}
    </SidebarContext.Provider>
  );
}

// ── Nav groups ───────────────────────────────────────────────────────────────

interface NavItem { href: string; labelKey: string; label: string; icon: ReactNode }
interface NavGroup { groupKey: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    groupKey: 'nav.group.main',
    items: [
      { href: '/',                  labelKey: 'nav.dashboard',   label: 'Dashboard',         icon: <DashboardIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.business',
    items: [
      { href: '/business',          labelKey: 'nav.business',    label: 'Business KPIs',     icon: <BarChartIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.clinical',
    items: [
      { href: '/voice',             labelKey: 'nav.voice',       label: 'Voice Sessions',    icon: <MicIcon /> },
      { href: '/triage',            labelKey: 'nav.triage',      label: 'Triage',            icon: <SmartToyIcon /> },
      { href: '/encounters',        labelKey: 'nav.encounters',  label: 'Encounters',        icon: <MedicalInformationIcon /> },
      { href: '/scheduling',        labelKey: 'nav.scheduling',  label: 'Scheduling',        icon: <CalendarMonthIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.analytics',
    items: [
      { href: '/population-health', labelKey: 'nav.population',  label: 'Population Health', icon: <TrendingUpIcon /> },
      { href: '/revenue',           labelKey: 'nav.revenue',     label: 'Revenue Cycle',     icon: <AttachMoneyIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.patient',
    items: [
      { href: '/patient-portal',    labelKey: 'nav.consent',     label: 'Patient Portal',    icon: <PersonIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.governance',
    items: [
      { href: '/governance',        labelKey: 'nav.governance',  label: 'AI Governance',     icon: <AccountBalanceIcon /> },
    ],
  },
  {
    groupKey: 'nav.group.admin',
    items: [
      { href: '/tenants',              labelKey: 'nav.tenants',       label: 'Tenants',          icon: <ApartmentIcon /> },
      { href: '/admin/users',          labelKey: 'nav.users',         label: 'Users',            icon: <ManageAccountsIcon /> },
      { href: '/admin/practitioners',  labelKey: 'nav.practitioners', label: 'Practitioners',    icon: <BadgeIcon /> },
      { href: '/admin/audit',          labelKey: 'nav.audit',         label: 'Audit Log',        icon: <PolicyIcon /> },
      { href: '/admin/break-glass',    labelKey: 'nav.breakglass',    label: 'Break-Glass',      icon: <LockOpenIcon /> },
      { href: '/admin/feedback',       labelKey: 'nav.feedback',      label: 'AI Feedback',      icon: <RateReviewIcon /> },
      { href: '/admin/health',         labelKey: 'nav.health',        label: 'Platform Health',  icon: <MonitorHeartIcon /> },
      { href: '/admin/demo',           labelKey: 'nav.demo',          label: 'Demo Admin',       icon: <SlideshowIcon /> },
      { href: '/admin/guide-history',  labelKey: 'nav.guide',         label: 'Guide History',    icon: <HistoryIcon /> },
      { href: '/admin',                labelKey: 'nav.admin',         label: 'Admin Settings',   icon: <AdminPanelSettingsIcon /> },
    ],
  },
];

const groupLabels: Record<string, string> = {
  'nav.group.main':        '',
  'nav.group.business':    'Business',
  'nav.group.clinical':    'Clinical',
  'nav.group.analytics':   'Analytics',
  'nav.group.patient':     'Patient',
  'nav.group.governance':  'Governance',
  'nav.group.admin':       'Admin',
};

// ── Shared nav content ────────────────────────────────────────────────────────

function SidebarContent({ onClose, collapsed = false }: { onClose?: () => void; collapsed?: boolean }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { toggleCollapse } = useSidebar();
  const theme = useTheme();

  return (
    <Box sx={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', transition: 'width 0.22s ease' }}>

      {/* ── Logo + collapse toggle ── */}
      <Box sx={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        px: collapsed ? 0 : 2,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} color="primary.main" lineHeight={1.1}>
              HealthQ
            </Typography>
            <Typography variant="caption" color="text.secondary" lineHeight={1}>
              Copilot
            </Typography>
          </Box>
        )}
        {onClose ? (
          <IconButton size="small" onClick={onClose} aria-label="Close menu">
            <CloseIcon fontSize="small" />
          </IconButton>
        ) : (
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton size="small" onClick={toggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ── Nav groups ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
        {navGroups.map((group, gi) => (
          <Box key={group.groupKey}>
            {gi > 0 && !collapsed && (
              <Typography
                variant="caption"
                fontWeight={600}
                color="text.disabled"
                sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}
              >
                {groupLabels[group.groupKey]}
              </Typography>
            )}
            {gi > 0 && collapsed && <Divider sx={{ my: 0.75, mx: 1 }} />}
            <List dense disablePadding sx={{ px: collapsed ? 0.75 : 1 }}>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const btn = (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    to={item.href}
                    selected={isActive}
                    onClick={onClose}
                    sx={{
                      borderRadius: 2,
                      mb: 0.25,
                      minHeight: 40,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      px: collapsed ? 1 : 1.5,
                      position: 'relative',
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                        '&:hover': { bgcolor: 'primary.dark' },
                      },
                      '&:not(.Mui-selected):hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, mr: collapsed ? 0 : 0, color: isActive ? 'inherit' : 'text.secondary', '& svg': { fontSize: 20 } }}>
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={t(item.labelKey, item.label)}
                        primaryTypographyProps={{ fontSize: 13.5, fontWeight: isActive ? 600 : 400 }}
                      />
                    )}
                  </ListItemButton>
                );
                return collapsed ? (
                  <Tooltip key={item.href} title={t(item.labelKey, item.label)} placement="right">
                    <span>{btn}</span>
                  </Tooltip>
                ) : btn;
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* ── Version footer ── */}
      {!collapsed && (
        <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.disabled">
            HealthQ Copilot v2.30
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Public Sidebar component ──────────────────────────────────────────────────

export function Sidebar() {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mobileOpen, collapsed, toggleMobile } = useSidebar();

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={toggleMobile}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: SIDEBAR_WIDTH } }}
      >
        <SidebarContent onClose={toggleMobile} />
      </Drawer>
    );
  }

  return (
    <Box
      component="aside"
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.22s ease',
        overflow: 'hidden',
      }}
    >
      <SidebarContent collapsed={collapsed} />
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
