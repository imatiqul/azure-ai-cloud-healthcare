import { createTheme } from '@mui/material/styles';

const baseShape = { borderRadius: 8 };
const baseTypography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
};
const baseComponents = {
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none' as const, fontWeight: 500 },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        border: '1px solid',
        borderColor: 'divider',
      },
    },
  },
};

export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary:    { main: '#2563eb', light: '#60a5fa', dark: '#1d4ed8' },
        secondary:  { main: '#64748b', light: '#94a3b8', dark: '#475569' },
        error:      { main: '#dc2626', light: '#fca5a5', dark: '#991b1b' },
        warning:    { main: '#d97706', light: '#fde68a', dark: '#92400e' },
        success:    { main: '#16a34a', light: '#bbf7d0', dark: '#166534' },
        background: { default: '#f8fafc', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary:    { main: '#60a5fa', light: '#93c5fd', dark: '#2563eb' },
        secondary:  { main: '#94a3b8', light: '#cbd5e1', dark: '#64748b' },
        error:      { main: '#f87171', light: '#fca5a5', dark: '#dc2626' },
        warning:    { main: '#fbbf24', light: '#fde68a', dark: '#d97706' },
        success:    { main: '#4ade80', light: '#bbf7d0', dark: '#16a34a' },
        background: { default: '#0f172a', paper: '#1e293b' },
      },
    },
  },
  typography: baseTypography,
  shape:      baseShape,
  components: baseComponents,
});

