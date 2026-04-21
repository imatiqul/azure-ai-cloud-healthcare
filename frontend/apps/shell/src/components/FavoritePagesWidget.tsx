import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import { loadFavorites, toggleFavorite } from '../hooks/useFavorites';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map href → human-readable label (mirrors PageTracker's label map) */
const PAGE_LABELS: Record<string, string> = {
  '/':                     'Dashboard',
  '/notifications':        'Notification Center',
  '/business':             'Business KPIs',
  '/voice':                'Voice Sessions',
  '/triage':               'Triage',
  '/encounters':           'Encounters',
  '/scheduling':           'Scheduling',
  '/population-health':    'Population Health',
  '/revenue':              'Revenue Cycle',
  '/patient-portal':       'Patient Portal',
  '/governance':           'AI Governance',
  '/tenants':              'Tenants',
  '/admin/users':          'Users',
  '/admin/practitioners':  'Practitioners',
  '/admin/audit':          'Audit Log',
  '/admin/break-glass':    'Break-Glass',
  '/admin/feedback':       'AI Feedback',
  '/admin/health':         'Platform Health',
  '/admin/preferences':    'Preferences',
  '/admin/profile':        'My Profile',
};

function getLabel(href: string): string {
  return PAGE_LABELS[href] ?? href;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FavoritePagesWidget() {
  const navigate  = useNavigate();
  const [hrefs, setHrefs] = useState<string[]>([]);

  useEffect(() => {
    setHrefs(loadFavorites());
  }, []);

  const handleUnpin = (href: string) => {
    toggleFavorite(href);
    setHrefs(prev => prev.filter(h => h !== href));
  };

  if (hrefs.length === 0) return null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader>
        <Stack direction="row" alignItems="center" spacing={1}>
          <StarIcon sx={{ fontSize: 18, color: 'warning.main' }} />
          <CardTitle>Pinned Pages</CardTitle>
        </Stack>
      </CardHeader>
      <CardContent sx={{ pt: 0 }}>
        {hrefs.map((href, idx) => (
          <Box key={href}>
            {idx > 0 && <Divider />}
            <Box
              sx={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                py:   0.75,
                px:   0.5,
                borderRadius:   1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box
                role="button"
                tabIndex={0}
                onClick={() => navigate(href)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(href)}
                sx={{
                  flex:   1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mr: 0.5,
                }}
              >
                <Typography variant="body2" fontWeight={500}>
                  {getLabel(href)}
                </Typography>
                <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </Box>
              <Tooltip title="Unpin">
                <IconButton
                  size="small"
                  onClick={() => handleUnpin(href)}
                  aria-label={`Unpin ${getLabel(href)}`}
                  sx={{ color: 'warning.main' }}
                >
                  <StarIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Star toggle button (used in Sidebar) ──────────────────────────────────────

interface FavoriteStarProps {
  href:    string;
  label:   string;
}

export function FavoriteStar({ href, label }: FavoriteStarProps) {
  const [pinned, setPinned] = useState(() => loadFavorites().includes(href));

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggleFavorite(href);
    setPinned(added);
  };

  return (
    <Tooltip title={pinned ? `Unpin ${label}` : `Pin ${label}`} placement="right">
      <IconButton
        size="small"
        onClick={handleClick}
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        sx={{
          opacity:    pinned ? 1 : 0,
          color:      pinned ? 'warning.main' : 'text.disabled',
          transition: 'opacity 0.15s',
          ml: 'auto',
          '.MuiListItemButton-root:hover &': { opacity: 1 },
        }}
      >
        {pinned ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
