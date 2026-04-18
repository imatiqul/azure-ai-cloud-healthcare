import { Link, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MicIcon from '@mui/icons-material/Mic';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import PersonIcon from '@mui/icons-material/Person';

const navItems = [
  { href: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { href: '/voice', label: 'Voice Sessions', icon: <MicIcon /> },
  { href: '/triage', label: 'AI Triage', icon: <SmartToyIcon /> },
  { href: '/encounters', label: 'Encounters', icon: <MedicalInformationIcon /> },
  { href: '/scheduling', label: 'Scheduling', icon: <CalendarMonthIcon /> },
  { href: '/population-health', label: 'Population Health', icon: <TrendingUpIcon /> },
  { href: '/revenue', label: 'Revenue Cycle', icon: <AttachMoneyIcon /> },
  { href: '/patient-portal', label: 'Patient Portal', icon: <PersonIcon /> },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <Box
      component="aside"
      sx={{
        width: 260,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" fontWeight="bold" color="primary">
          Healthcare AI
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Clinical Platform
        </Typography>
      </Box>
      <List sx={{ flex: 1, px: 1, pt: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.href}
            component={Link}
            to={item.href}
            selected={pathname === item.href}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
