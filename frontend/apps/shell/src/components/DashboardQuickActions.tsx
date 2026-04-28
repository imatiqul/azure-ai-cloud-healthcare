import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import MicIcon from '@mui/icons-material/Mic';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Card, CardContent } from '@healthcare/design-system';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuickAction {
  label:    string;
  subtitle: string;
  icon:     React.ReactNode;
  href:     string;
  color:    string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  {
    label:    'Start Voice Session',
    subtitle: 'Dictate notes or begin voice triage',
    icon:     <MicIcon sx={{ fontSize: 28 }} />,
    href:     '/voice',
    color:    '#7c3aed',
  },
  {
    label:    'New Triage Session',
    subtitle: 'AI-assisted clinical triage',
    icon:     <SmartToyIcon sx={{ fontSize: 28 }} />,
    href:     '/triage',
    color:    '#2563eb',
  },
  {
    label:    'Book Appointment',
    subtitle: 'Schedule a patient slot',
    icon:     <CalendarMonthIcon sx={{ fontSize: 28 }} />,
    href:     '/scheduling',
    color:    '#059669',
  },
  {
    label:    'Register Patient',
    subtitle: 'Add a new patient record',
    icon:     <PersonAddIcon sx={{ fontSize: 28 }} />,
    href:     '/patient-portal',
    color:    '#d97706',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardQuickActions() {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
          Quick Actions
        </Typography>
        <Grid container spacing={1.5}>
          {QUICK_ACTIONS.map((action) => (
            <Grid key={action.href} size={{ xs: 6, sm: 3 }}>
              <ButtonBase
                onClick={() => navigate(action.href)}
                aria-label={action.label}
                sx={{
                  width: '100%',
                  borderRadius: 2,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  transition: 'all 0.15s',
                  '&:hover': {
                    bgcolor: 'action.hover',
                    borderColor: action.color,
                    transform: 'translateY(-1px)',
                    boxShadow: 2,
                  },
                }}
              >
                <Box sx={{ color: action.color }}>{action.icon}</Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
                    {action.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.3} mt={0.25}>
                    {action.subtitle}
                  </Typography>
                </Box>
              </ButtonBase>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
}
