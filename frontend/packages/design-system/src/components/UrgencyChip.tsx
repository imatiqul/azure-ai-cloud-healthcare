import Chip, { type ChipProps } from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';

export type UrgencyLevel = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

const urgencyConfig: Record<UrgencyLevel, { label: string; color: ChipProps['color']; title: string }> = {
  P1: { label: 'P1 — Immediate', color: 'error',   title: 'Life-threatening — resuscitate' },
  P2: { label: 'P2 — Emergent', color: 'warning',  title: 'High risk — treat within 10 min' },
  P3: { label: 'P3 — Urgent',   color: 'primary',  title: 'Stable — treat within 30 min' },
  P4: { label: 'P4 — Less Urgent', color: 'info',  title: 'Minor — treat within 1 hour' },
  P5: { label: 'P5 — Non-Urgent', color: 'default', title: 'Routine — treat within 2 hours' },
};

export interface UrgencyChipProps {
  level: UrgencyLevel;
  showLabel?: boolean;
}

/**
 * Displays a triage urgency level (P1–P5) as a colour-coded chip.
 * Colour palette follows the Manchester Triage System conventions.
 */
export function UrgencyChip({ level, showLabel = true }: UrgencyChipProps) {
  const config = urgencyConfig[level];
  return (
    <Tooltip title={config.title}>
      <Chip
        label={showLabel ? config.label : level}
        color={config.color}
        size="small"
        sx={{ fontWeight: 700, letterSpacing: 0.5 }}
      />
    </Tooltip>
  );
}
