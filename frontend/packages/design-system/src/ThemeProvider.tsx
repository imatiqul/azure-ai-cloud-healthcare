import { createContext, useContext, type ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, useColorScheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';

// ── Colour mode context ────────────────────────────────────────────────────────

interface ColorModeContextValue {
  mode: 'light' | 'dark' | 'system';
  toggleMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'system',
  toggleMode: () => {},
});

export function useColorMode(): ColorModeContextValue {
  return useContext(ColorModeContext);
}

// ── Inner component (must be inside MuiThemeProvider to call useColorScheme) ──

function ColorModeToggler({ children }: { children: ReactNode }) {
  const { mode, setMode } = useColorScheme();

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <ColorModeContext.Provider value={{ mode: mode ?? 'system', toggleMode }}>
      {children}
    </ColorModeContext.Provider>
  );
}

// ── Public ThemeProvider ───────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MuiThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <ColorModeToggler>
        {children}
      </ColorModeToggler>
    </MuiThemeProvider>
  );
}
