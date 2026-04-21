import { forwardRef } from 'react';
import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

type VariantMap = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type SizeMap = 'default' | 'sm' | 'lg' | 'icon' | 'small' | 'md';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size'> {
  variant?: VariantMap;
  size?: SizeMap;
  /** Shows a spinner and disables the button while true */
  loading?: boolean;
}

const variantMapping: Record<VariantMap, { variant: MuiButtonProps['variant']; color?: MuiButtonProps['color'] }> = {
  default: { variant: 'contained', color: 'primary' },
  destructive: { variant: 'contained', color: 'error' },
  outline: { variant: 'outlined' },
  secondary: { variant: 'contained', color: 'secondary' },
  ghost: { variant: 'text' },
  link: { variant: 'text', color: 'primary' },
};

const sizeMapping: Record<SizeMap, MuiButtonProps['size']> = {
  default: 'medium',
  sm: 'small',
  lg: 'large',
  icon: 'small',
  small: 'small',
  md: 'medium',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'default', loading = false, disabled, sx, children, startIcon, ...props }, ref) => {
    const mapped = variantMapping[variant] ?? variantMapping.default;
    return (
      <MuiButton
        ref={ref}
        variant={mapped.variant}
        color={mapped.color}
        size={sizeMapping[size]}
        disabled={disabled || loading}
        startIcon={loading ? <CircularProgress size={14} color="inherit" /> : startIcon}
        sx={[
          variant === 'link' && { textDecoration: 'underline', '&:hover': { textDecoration: 'underline' } },
          size === 'icon' && { minWidth: 36, width: 36, height: 36, p: 0 },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...props}
      >
        {children}
      </MuiButton>
    );
  }
);
Button.displayName = 'Button';

