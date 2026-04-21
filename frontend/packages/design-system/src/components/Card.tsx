import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import MuiCard, { type CardProps } from '@mui/material/Card';
import MuiCardContent, { type CardContentProps } from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface ExtendedCardProps extends CardProps {
  /** Makes the card interactive with hover lift + shadow */
  interactive?: boolean;
  /** Accent colour on the left border edge (CSS colour value or theme token) */
  accent?: string;
}

export const Card = forwardRef<HTMLDivElement, ExtendedCardProps>(
  ({ children, interactive = false, accent, sx, ...props }, ref) => (
    <MuiCard
      ref={ref}
      sx={[
        interactive && {
          cursor: 'pointer',
          '&:hover': {
            boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.12)',
            transform: 'translateY(-2px)',
          },
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        },
        accent && {
          borderLeft: `3px solid ${accent}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {children}
    </MuiCard>
  )
);
Card.displayName = 'Card';

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Action slot rendered at the right side of the header */
  action?: React.ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, action, ...props }, ref) => (
    <Box
      ref={ref}
      sx={{ px: 2.5, pt: 2.5, pb: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
      {...props}
    >
      <Box flex={1}>{children}</Box>
      {action && <Box flexShrink={0}>{action}</Box>}
    </Box>
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ children, ...props }, ref) => (
    <Typography ref={ref} variant="h6" component="h3" fontWeight={600} lineHeight={1.3} {...props}>
      {children}
    </Typography>
  )
);
CardTitle.displayName = 'CardTitle';

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, ...props }, ref) => (
    <MuiCardContent ref={ref} {...props}>{children}</MuiCardContent>
  )
);
CardContent.displayName = 'CardContent';
