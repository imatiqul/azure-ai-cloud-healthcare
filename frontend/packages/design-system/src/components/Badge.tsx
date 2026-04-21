import { type HTMLAttributes } from 'react';
import Chip, { type ChipProps } from '@mui/material/Chip';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'danger' | 'error';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color'> {
  variant?: BadgeVariant;
  /** Alias for variant — accepts the same values */
  color?: BadgeVariant;
}

const colorMapping: Record<BadgeVariant, ChipProps['color']> = {
  default: 'primary',
  secondary: 'secondary',
  destructive: 'error',
  outline: 'default',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  error: 'error',
};

export function Badge({ variant, color, children, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? color ?? 'default';
  return (
    <Chip
      label={children}
      color={colorMapping[resolvedVariant]}
      variant={resolvedVariant === 'outline' ? 'outlined' : 'filled'}
      size="small"
      {...(props as any)}
    />
  );
}
