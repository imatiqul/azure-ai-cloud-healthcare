import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  /** Page title — always visible */
  title: string;
  /** Short subtitle or description rendered below the title */
  subtitle?: string;
  /** Breadcrumb path rendered above the title */
  breadcrumbs?: BreadcrumbItem[];
  /** Actions slot (e.g. buttons) rendered at the far right */
  actions?: ReactNode;
  /** Icon rendered to the left of the title */
  icon?: ReactNode;
}

/**
 * Consistent full-page header with title, optional breadcrumbs, subtitle and
 * an actions slot. Used at the top of every first-class page view.
 */
export function PageHeader({ title, subtitle, breadcrumbs, actions, icon }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          sx={{ mb: 0.75, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}
        >
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            if (isLast) {
              return (
                <Typography key={crumb.label} variant="caption" fontWeight={600} color="text.primary">
                  {crumb.label}
                </Typography>
              );
            }
            return (
              <Typography
                key={crumb.label}
                variant="caption"
                color="text.secondary"
                component={crumb.href ? 'a' : 'span'}
                href={crumb.href}
                onClick={crumb.onClick}
                sx={[
                  { textDecoration: 'none' },
                  (crumb.href || crumb.onClick) ? {
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                  } : {},
                ]}
              >
                {crumb.label}
              </Typography>
            );
          })}
        </Breadcrumbs>
      )}

      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          {icon && (
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                '& svg': { fontSize: 22 },
              }}
            >
              {icon}
            </Box>
          )}
          <Box>
            <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" mt={0.25}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
        {actions && (
          <Stack direction="row" alignItems="center" gap={1} flexShrink={0}>
            {actions}
          </Stack>
        )}
      </Stack>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
