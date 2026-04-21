import { createTheme, alpha } from '@mui/material/styles';

const baseShape = { borderRadius: 10 };

const baseTypography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: { fontWeight: 700, letterSpacing: '-0.025em' },
  h2: { fontWeight: 700, letterSpacing: '-0.025em' },
  h3: { fontWeight: 700, letterSpacing: '-0.02em' },
  h4: { fontWeight: 700, letterSpacing: '-0.015em' },
  h5: { fontWeight: 700, letterSpacing: '-0.01em' },
  h6: { fontWeight: 600, letterSpacing: '-0.005em' },
  subtitle1: { fontWeight: 500 },
  subtitle2: { fontWeight: 600 },
  body1: { lineHeight: 1.6 },
  body2: { lineHeight: 1.6 },
  button: { fontWeight: 500, letterSpacing: '0.01em' },
  caption: { letterSpacing: '0.02em' },
};

const baseComponents = {
  MuiCssBaseline: {
    styleOverrides: {
      '*': { boxSizing: 'border-box' },
      'html, body': { height: '100%', scrollBehavior: 'smooth' },
      '::-webkit-scrollbar': { width: '6px', height: '6px' },
      '::-webkit-scrollbar-track': { background: 'transparent' },
      '::-webkit-scrollbar-thumb': { background: 'rgba(100,116,139,0.35)', borderRadius: '3px' },
      '::-webkit-scrollbar-thumb:hover': { background: 'rgba(100,116,139,0.6)' },
    },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        textTransform: 'none' as const,
        fontWeight: 500,
        borderRadius: 8,
        transition: 'all 0.15s ease',
        '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 2 },
      },
      contained: {
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        '&:hover': { boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', transform: 'translateY(-1px)' },
        '&:active': { transform: 'translateY(0)' },
      },
      outlined: {
        '&:hover': { transform: 'translateY(-1px)' },
        '&:active': { transform: 'translateY(0)' },
      },
      sizeSmall: { borderRadius: 6, padding: '4px 12px' },
      sizeLarge: { borderRadius: 10, padding: '12px 24px', fontSize: '0.9375rem' },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        border: '1px solid',
        borderColor: 'rgba(0,0,0,0.08)',
        borderRadius: 12,
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      },
    },
  },
  MuiCardContent: {
    styleOverrides: {
      root: { padding: '16px 20px', '&:last-child': { paddingBottom: 20 } },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { fontWeight: 500, letterSpacing: '0.02em' },
      sizeSmall: { fontSize: '0.7rem', height: 22 },
    },
  },
  MuiTextField: {
    defaultProps: { size: 'small' as const },
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8,
          transition: 'box-shadow 0.15s ease',
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(37,99,235,0.15)',
          },
        },
      },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        transition: 'background-color 0.15s ease, transform 0.1s ease',
        '&.Mui-selected': {
          fontWeight: 600,
          '&:hover': { backgroundColor: undefined },
        },
      },
    },
  },
  MuiTooltip: {
    defaultProps: { arrow: true, placement: 'top' as const },
    styleOverrides: {
      tooltip: { fontSize: '0.7rem', fontWeight: 500, borderRadius: 6, padding: '4px 10px' },
    },
  },
  MuiDivider: {
    styleOverrides: { root: { borderColor: 'rgba(0,0,0,0.07)' } },
  },
  MuiAppBar: {
    styleOverrides: {
      root: { backgroundImage: 'none' },
    },
  },
  MuiDialog: {
    styleOverrides: { paper: { borderRadius: 14, boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)' } },
  },
  MuiAlert: {
    styleOverrides: { root: { borderRadius: 8 } },
  },
  MuiAvatar: {
    styleOverrides: { root: { fontWeight: 700 } },
  },
};

export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary:    { main: '#2563eb', light: '#60a5fa', dark: '#1d4ed8', contrastText: '#fff' },
        secondary:  { main: '#64748b', light: '#94a3b8', dark: '#475569' },
        error:      { main: '#dc2626', light: '#fca5a5', dark: '#991b1b' },
        warning:    { main: '#d97706', light: '#fde68a', dark: '#92400e' },
        success:    { main: '#16a34a', light: '#bbf7d0', dark: '#166534' },
        info:       { main: '#0891b2', light: '#67e8f9', dark: '#0e7490' },
        background: { default: '#f1f5f9', paper: '#ffffff' },
        divider: 'rgba(0,0,0,0.08)',
      },
    },
    dark: {
      palette: {
        primary:    { main: '#60a5fa', light: '#93c5fd', dark: '#3b82f6', contrastText: '#fff' },
        secondary:  { main: '#94a3b8', light: '#cbd5e1', dark: '#64748b' },
        error:      { main: '#f87171', light: '#fca5a5', dark: '#dc2626' },
        warning:    { main: '#fbbf24', light: '#fde68a', dark: '#d97706' },
        success:    { main: '#4ade80', light: '#bbf7d0', dark: '#16a34a' },
        info:       { main: '#22d3ee', light: '#a5f3fc', dark: '#0891b2' },
        background: { default: '#0b1120', paper: '#131c2e' },
        divider: 'rgba(255,255,255,0.08)',
      },
    },
  },
  typography: baseTypography,
  shape:      baseShape,
  components: baseComponents,
});

