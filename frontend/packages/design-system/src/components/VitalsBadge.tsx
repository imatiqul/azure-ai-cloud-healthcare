import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';

export type VitalStatus = 'normal' | 'warning' | 'critical';

const statusColors: Record<VitalStatus, string> = {
  normal:   'success.main',
  warning:  'warning.main',
  critical: 'error.main',
};

export interface VitalReading {
  label: string;       // e.g. "HR", "SpO₂", "BP", "Temp"
  value: string;       // e.g. "72 bpm", "98%", "120/80"
  status: VitalStatus;
  timestamp?: string;  // ISO 8601
}

export interface VitalsBadgeProps {
  vital: VitalReading;
  compact?: boolean;
}

/**
 * Displays a single vital sign reading with colour-coded status.
 * Used in triage MFE, patient portal, and wearable stream views.
 */
export function VitalsBadge({ vital, compact = false }: VitalsBadgeProps) {
  const color = statusColors[vital.status];

  return (
    <Tooltip title={vital.timestamp ? `Recorded: ${vital.timestamp}` : vital.label}>
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          border: '2px solid',
          borderColor: color,
          borderRadius: 2,
          px: compact ? 1 : 1.5,
          py: compact ? 0.5 : 1,
          minWidth: compact ? 56 : 72,
          backgroundColor: `${color.replace('.main', '')}.50`,
        }}
      >
        <Typography
          variant={compact ? 'caption' : 'body2'}
          color="text.secondary"
          fontWeight={600}
          lineHeight={1}
        >
          {vital.label}
        </Typography>
        <Typography
          variant={compact ? 'body2' : 'h6'}
          color={color}
          fontWeight={700}
          lineHeight={1.2}
          mt={0.25}
        >
          {vital.value}
        </Typography>
      </Box>
    </Tooltip>
  );
}
