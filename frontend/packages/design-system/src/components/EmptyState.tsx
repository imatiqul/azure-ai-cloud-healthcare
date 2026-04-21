import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Icon element to display (e.g. a MUI SvgIcon). 48 px is a good size. */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Consistent empty-state placeholder for panels, tables, and lists.
 * Renders a centred icon + heading + optional description + optional CTA.
 */
export function EmptyState({ icon, title, description, action, sx }: EmptyStateProps) {
  return (
    <Box
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          py: 6,
          px: 3,
          textAlign: 'center',
          color: 'text.secondary',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon && (
        <Box sx={{ color: 'text.disabled', '& svg': { fontSize: 48, opacity: 0.5 } }}>
          {icon}
        </Box>
      )}
      <Typography variant="subtitle1" fontWeight={600} color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" maxWidth={360}>
          {description}
        </Typography>
      )}
      {action && <Box mt={0.5}>{action}</Box>}
    </Box>
  );
}
