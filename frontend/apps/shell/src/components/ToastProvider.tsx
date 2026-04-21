import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id:        number;
  message:   string;
  severity:  Severity;
  duration:  number;
}

interface ToastContextValue {
  showToast: (message: string, severity?: Severity, duration?: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue]     = useState<ToastMessage[]>([]);
  const [open, setOpen]       = useState(false);
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  const showToast = useCallback((
    message:  string,
    severity: Severity = 'info',
    duration: number   = 4000,
  ) => {
    const toast: ToastMessage = { id: nextId++, message, severity, duration };
    setQueue(q => [...q, toast]);
  }, []);

  // Pop next from queue whenever the snackbar closes
  const processQueue = useCallback(() => {
    setQueue(q => {
      if (q.length === 0) {
        setCurrent(null);
        setOpen(false);
        return q;
      }
      const [next, ...rest] = q;
      setCurrent(next);
      setOpen(true);
      return rest;
    });
  }, []);

  // When a new item enters the queue and nothing is shown, show it
  const handleExited = useCallback(() => {
    processQueue();
  }, [processQueue]);

  // Kick off first toast when queue goes from 0→1
  if (queue.length > 0 && !open && !current) {
    processQueue();
  }

  const handleClose = (_: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={current?.duration ?? 4000}
        onClose={handleClose}
        TransitionProps={{ onExited: handleExited }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 2 }}
      >
        <Alert
          onClose={() => setOpen(false)}
          severity={current?.severity ?? 'info'}
          variant="filled"
          sx={{ minWidth: 300, boxShadow: 4 }}
        >
          {current?.message ?? ''}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
