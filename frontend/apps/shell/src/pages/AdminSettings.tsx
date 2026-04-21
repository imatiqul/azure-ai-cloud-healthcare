import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import { useTranslation } from 'react-i18next';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import TranslateIcon from '@mui/icons-material/Translate';
import ApiIcon from '@mui/icons-material/Api';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

// ─── Constants ──────────────────────────────────────────────────────────────

const PLATFORM_VERSION = '1.0.0';
const BUILD_DATE       = '2025-01-01';
const API_BASE         = import.meta.env.VITE_API_BASE_URL || '(not configured)';
const GRAPHQL_ENDPOINT = `${import.meta.env.VITE_API_BASE_URL || ''}/graphql`;

const PREF_ALERT_DENIALS  = 'hq:pref:alert-denials';
const PREF_ALERT_TRIAGE   = 'hq:pref:alert-triage';
const PREF_ALERT_DELIVERY = 'hq:pref:alert-delivery';

const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'عربي' },
];

// ─── Section wrapper ─────────────────────────────────────────────────────────

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader>
        <CardTitle>
          <Stack direction="row" alignItems="center" gap={1}>
            {icon}
            {title}
          </Stack>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminSettings() {
  const { i18n } = useTranslation();
  const navigate  = useNavigate();

  // Alert notification prefs (persisted in localStorage)
  const [alertDenials,  setAlertDenials]  = useState(() => localStorage.getItem(PREF_ALERT_DENIALS)  !== 'false');
  const [alertTriage,   setAlertTriage]   = useState(() => localStorage.getItem(PREF_ALERT_TRIAGE)   !== 'false');
  const [alertDelivery, setAlertDelivery] = useState(() => localStorage.getItem(PREF_ALERT_DELIVERY) !== 'false');
  const [savedMsg, setSavedMsg]           = useState(false);

  // Persist prefs on change
  useEffect(() => { localStorage.setItem(PREF_ALERT_DENIALS,  String(alertDenials));  }, [alertDenials]);
  useEffect(() => { localStorage.setItem(PREF_ALERT_TRIAGE,   String(alertTriage));   }, [alertTriage]);
  useEffect(() => { localStorage.setItem(PREF_ALERT_DELIVERY, String(alertDelivery)); }, [alertDelivery]);

  // Show a transient "saved" indicator whenever a toggle changes
  const handleToggle = (setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const changeLocale = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', py: 1 }}>
      <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
        <SettingsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Admin Settings</Typography>
      </Stack>

      {/* 1 ── Platform Information ─────────────────────────────────────────── */}
      <SectionCard icon={<InfoOutlinedIcon color="primary" fontSize="small" />} title="Platform Information">
        <Grid container spacing={2}>
          {[
            { label: 'Product',          value: 'HealthQ Copilot' },
            { label: 'Version',          value: PLATFORM_VERSION },
            { label: 'Build Date',       value: BUILD_DATE },
            { label: 'Environment',      value: import.meta.env.MODE ?? 'development' },
            { label: 'Frontend Stack',   value: 'React 19 · MUI v6 · Vite · Module Federation' },
            { label: 'Backend Stack',    value: '.NET 9 · Dapr · Azure Container Apps' },
          ].map(({ label, value }) => (
            <Grid item xs={12} sm={6} key={label}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Chip label={value} size="small" variant="outlined" sx={{ mt: 0.25, fontFamily: value.startsWith('React') || value.startsWith('.NET') ? 'monospace' : undefined }} />
            </Grid>
          ))}
        </Grid>
      </SectionCard>

      {/* 2 ── Notification Preferences ─────────────────────────────────────── */}
      <SectionCard icon={<NotificationsNoneIcon color="primary" fontSize="small" />} title="Live Alert Preferences">
        <Typography variant="body2" color="text.secondary" mb={2}>
          Control which platform alerts appear in the top navigation bar. Preferences are stored locally in this browser.
        </Typography>
        <Stack gap={0.5}>
          <FormControlLabel
            control={
              <Switch
                checked={alertDenials}
                onChange={e => handleToggle(setAlertDenials)(e.target.checked)}
                inputProps={{ 'aria-label': 'alert-denials' }}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Revenue denial deadline alerts</Typography>
                <Typography variant="caption" color="text.secondary">Warns when claim denials are within 7 days of appeal deadline</Typography>
              </Box>
            }
          />
          <Divider sx={{ my: 0.5 }} />
          <FormControlLabel
            control={
              <Switch
                checked={alertTriage}
                onChange={e => handleToggle(setAlertTriage)(e.target.checked)}
                inputProps={{ 'aria-label': 'alert-triage' }}
              />
            }
            label={
              <Box>
                <Typography variant="body2">High-priority triage escalations</Typography>
                <Typography variant="caption" color="text.secondary">Shows P1/P2 triage sessions requiring human review</Typography>
              </Box>
            }
          />
          <Divider sx={{ my: 0.5 }} />
          <FormControlLabel
            control={
              <Switch
                checked={alertDelivery}
                onChange={e => handleToggle(setAlertDelivery)(e.target.checked)}
                inputProps={{ 'aria-label': 'alert-delivery' }}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Notification delivery failure alerts</Typography>
                <Typography variant="caption" color="text.secondary">Warns when the notification delivery failure rate exceeds 10 %</Typography>
              </Box>
            }
          />
        </Stack>
        {savedMsg && (
          <Alert severity="success" sx={{ mt: 2 }}>Preferences saved</Alert>
        )}
      </SectionCard>

      {/* 3 ── Display Preferences ──────────────────────────────────────────── */}
      <SectionCard icon={<TranslateIcon color="primary" fontSize="small" />} title="Display Preferences">
        <Typography variant="body2" color="text.secondary" mb={2}>
          Select your preferred language. The theme (light / dark) is toggled via the sun/moon icon in the top navigation bar.
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {SUPPORTED_LOCALES.map(loc => (
            <Chip
              key={loc.code}
              label={loc.label}
              onClick={() => changeLocale(loc.code)}
              color={i18n.language === loc.code ? 'primary' : 'default'}
              variant={i18n.language === loc.code ? 'filled' : 'outlined'}
              clickable
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
          Current language: <strong>{i18n.language}</strong>
        </Typography>
      </SectionCard>

      {/* 4 ── API Configuration ────────────────────────────────────────────── */}
      <SectionCard icon={<ApiIcon color="primary" fontSize="small" />} title="API Configuration">
        <Typography variant="body2" color="text.secondary" mb={2}>
          Read-only. Configure these values via environment variables at build time.
        </Typography>
        <Grid container spacing={1.5}>
          {[
            { label: 'REST API Base URL', value: API_BASE },
            { label: 'GraphQL Endpoint',  value: GRAPHQL_ENDPOINT },
          ].map(({ label, value }) => (
            <Grid item xs={12} key={label}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'action.hover',
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  mt: 0.25,
                  wordBreak: 'break-all',
                }}
              >
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </SectionCard>

      {/* 5 ── Security & Compliance ───────────────────────────────────────── */}
      <SectionCard icon={<ShieldOutlinedIcon color="primary" fontSize="small" />} title="Security & Compliance">
        <Typography variant="body2" color="text.secondary" mb={2}>
          Quick links to platform security and compliance features.
        </Typography>
        <Stack gap={1}>
          {[
            { label: 'PHI Audit Log',             href: '/admin/audit' },
            { label: 'Break-Glass Emergency Access', href: '/admin/break-glass' },
            { label: 'Identity User Management',  href: '/admin/users' },
            { label: 'Platform Health Dashboard', href: '/admin/health' },
            { label: 'AI Model Governance',       href: '/governance' },
          ].map(({ label, href }) => (
            <Link
              key={href}
              component="button"
              variant="body2"
              onClick={() => navigate(href)}
              underline="hover"
              sx={{ textAlign: 'left', color: 'primary.main' }}
            >
              → {label}
            </Link>
          ))}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          HealthQ Copilot is HIPAA-compliant, SOC 2 Type II aligned, ISO 27001:2022 mapped, and FedRAMP-boundary defined.
          Refer to the <em>docs/compliance/</em> folder for full audit documentation.
        </Typography>
      </SectionCard>
    </Box>
  );
}
