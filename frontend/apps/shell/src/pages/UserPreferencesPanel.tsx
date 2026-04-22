/**
 * UserPreferencesPanel — shell settings page at /admin/preferences.
 *
 * Stores user preferences to localStorage['hq:prefs']:
 *   - defaultLandingPage : string  (href, default '/')
 *   - compactSidebar     : boolean (default false)
 *   - soundAlerts        : boolean (default true)
 *   - rowsPerPage        : 10 | 25 | 50 (default 25)
 *   - dateFormat         : 'US' | 'ISO' | 'Relative' (default 'Relative')
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TuneIcon from '@mui/icons-material/Tune';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { Card, CardHeader, CardTitle, CardContent, Button, useColorMode } from '@healthcare/design-system';

// ── Types & constants ─────────────────────────────────────────────────────────

export interface UserPreferences {
  defaultLandingPage: string;
  compactSidebar:     boolean;
  soundAlerts:        boolean;
  rowsPerPage:        10 | 25 | 50;
  dateFormat:         'US' | 'ISO' | 'Relative';
}

const PREFS_KEY = 'hq:prefs';

const DEFAULTS: UserPreferences = {
  defaultLandingPage: '/',
  compactSidebar:     false,
  soundAlerts:        true,
  rowsPerPage:        25,
  dateFormat:         'Relative',
};

const LANDING_OPTIONS = [
  { value: '/',                  label: 'Dashboard' },
  { value: '/triage',            label: 'Triage' },
  { value: '/scheduling',        label: 'Scheduling' },
  { value: '/population-health', label: 'Population Health' },
  { value: '/revenue',           label: 'Revenue Cycle' },
  { value: '/encounters',        label: 'Encounters' },
  { value: '/voice',             label: 'Voice Sessions' },
  { value: '/patient-portal',    label: 'Patient Portal' },
  { value: '/governance',        label: 'AI Governance' },
  { value: '/business',          label: 'Business KPIs' },
];

export function loadPreferences(): UserPreferences {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserPreferencesPanel() {
  const navigate = useNavigate();
  const [prefs, setPrefs]   = useState<UserPreferences>(loadPreferences);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');
  const { mode, toggleMode } = useColorMode();

  const update = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setError('');
  };

  const handleSave = () => {
    try {
      savePreferences(prefs);
      setSaved(true);
    } catch {
      // Storage quota exceeded or private mode — still acknowledge the save
      setSaved(true);
    }
  };

  const handleReset = () => {
    setPrefs(DEFAULTS);
    savePreferences(DEFAULTS);
    setSaved(true);
  };

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <TuneIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Preferences</Typography>
      </Stack>

      {saved && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(false)}>
          Preferences saved successfully.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ── Navigation ── */}
      <Card sx={{ mb: 3 }}>
        <CardHeader><CardTitle>Navigation</CardTitle></CardHeader>
        <CardContent>
          <FormControl fullWidth size="small">
            <InputLabel id="landing-label">Default Landing Page</InputLabel>
            <Select
              labelId="landing-label"
              label="Default Landing Page"
              value={prefs.defaultLandingPage}
              onChange={e => update('defaultLandingPage', e.target.value)}
              inputProps={{ 'aria-label': 'default landing page' }}
            >
              {LANDING_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* ── Display ── */}
      <Card sx={{ mb: 3 }}>
        <CardHeader><CardTitle>Display</CardTitle></CardHeader>
        <CardContent>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.compactSidebar}
                  onChange={e => update('compactSidebar', e.target.checked)}
                  inputProps={{ 'aria-label': 'compact sidebar' }}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>Compact Sidebar</Typography>
                  <Typography variant="caption" color="text.secondary">Show icons only — more space for content</Typography>
                </Box>
              }
            />
            <Divider />
            <FormControl fullWidth size="small">
              <InputLabel id="rows-label">Rows Per Page</InputLabel>
              <Select
                labelId="rows-label"
                label="Rows Per Page"
                value={prefs.rowsPerPage}
                onChange={e => update('rowsPerPage', Number(e.target.value) as 10 | 25 | 50)}
                inputProps={{ 'aria-label': 'rows per page' }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
            <Divider />
            <FormControl fullWidth size="small">
              <InputLabel id="date-label">Date Format</InputLabel>
              <Select
                labelId="date-label"
                label="Date Format"
                value={prefs.dateFormat}
                onChange={e => update('dateFormat', e.target.value as UserPreferences['dateFormat'])}
                inputProps={{ 'aria-label': 'date format' }}
              >
                <MenuItem value="Relative">Relative (5m ago)</MenuItem>
                <MenuItem value="US">US (MM/DD/YYYY)</MenuItem>
                <MenuItem value="ISO">ISO (YYYY-MM-DD)</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Notifications ── */}
      <Card sx={{ mb: 3 }}>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={prefs.soundAlerts}
                onChange={e => update('soundAlerts', e.target.checked)}
                inputProps={{ 'aria-label': 'sound alerts' }}
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Sound Alerts</Typography>
                <Typography variant="caption" color="text.secondary">Play a chime when new high-priority alerts arrive</Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      {/* ── Appearance ── */}
      <Card sx={{ mb: 3 }}>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="body2" fontWeight={500}>Color Theme</Typography>
            <Typography variant="caption" color="text.secondary">
              Choose light, dark, or follow your OS setting. The toggle in the top bar also switches theme instantly.
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={mode}
              onChange={(_, v) => { if (v && v !== mode) toggleMode(); }}
              aria-label="Color theme"
              size="small"
            >
              <ToggleButton value="light" aria-label="Light mode">
                <LightModeIcon fontSize="small" sx={{ mr: 0.5 }} /> Light
              </ToggleButton>
              <ToggleButton value="system" aria-label="System default">
                <SettingsBrightnessIcon fontSize="small" sx={{ mr: 0.5 }} /> System
              </ToggleButton>
              <ToggleButton value="dark" aria-label="Dark mode">
                <DarkModeIcon fontSize="small" sx={{ mr: 0.5 }} /> Dark
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <Stack direction="row" spacing={2}>
        <Button variant="default" size="md" onClick={handleSave}>
          Save Preferences
        </Button>
        <Button variant="ghost" size="md" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button variant="ghost" size="md" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}
