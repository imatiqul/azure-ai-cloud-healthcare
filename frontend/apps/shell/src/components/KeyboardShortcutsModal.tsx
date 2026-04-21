import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { Button } from '@healthcare/design-system';
import KeyboardIcon from '@mui/icons-material/Keyboard';

// ─── Shortcut data ─────────────────────────────────────────────────────────

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  label: string;
  shortcuts: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'],     description: 'Open command palette' },
      { keys: ['Escape'],         description: 'Close dialog / palette' },
      { keys: ['?'],              description: 'Show keyboard shortcuts' },
    ],
  },
  {
    label: 'Command Palette',
    shortcuts: [
      { keys: ['↑', '↓'],        description: 'Move selection up / down' },
      { keys: ['↵ Enter'],        description: 'Navigate to selected page' },
      { keys: ['Escape'],         description: 'Close palette' },
    ],
  },
  {
    label: 'General',
    shortcuts: [
      { keys: ['Tab'],            description: 'Move focus forward' },
      { keys: ['Shift', 'Tab'],   description: 'Move focus backward' },
      { keys: ['Space / Enter'],  description: 'Activate button or link' },
    ],
  },
];

// ─── Key chip ──────────────────────────────────────────────────────────────

function KeyChip({ label }: { label: string }) {
  return (
    <Chip
      label={label}
      size="small"
      variant="outlined"
      sx={{
        fontFamily: 'monospace',
        fontSize: '0.72rem',
        fontWeight: 600,
        height: 22,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    />
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useKeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only fire when '?' is pressed outside an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}

// ─── Component ─────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="kbd-shortcuts-title"
    >
      <DialogTitle id="kbd-shortcuts-title">
        <Stack direction="row" alignItems="center" gap={1}>
          <KeyboardIcon fontSize="small" color="primary" />
          Keyboard Shortcuts
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {GROUPS.map((group, gi) => (
          <Box key={group.label}>
            {gi > 0 && <Divider />}
            <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5 }}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontSize: '0.65rem', letterSpacing: 1 }}
              >
                {group.label}
              </Typography>
            </Box>
            {group.shortcuts.map(s => (
              <Stack
                key={s.description}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ px: 2.5, py: 0.75 }}
              >
                <Typography variant="body2" color="text.primary">
                  {s.description}
                </Typography>
                <Stack direction="row" gap={0.5} flexShrink={0} ml={2}>
                  {s.keys.map(k => <KeyChip key={k} label={k} />)}
                </Stack>
              </Stack>
            ))}
            <Box sx={{ pb: 1 }} />
          </Box>
        ))}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Press <strong>?</strong> to toggle this panel
        </Typography>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
