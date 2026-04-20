import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { UrgencyChip, type UrgencyLevel } from './UrgencyChip';

export interface PatientCardProps {
  patientId: string;
  displayName: string;
  dateOfBirth: string;       // ISO 8601 date string
  gender?: string;
  mrn?: string;              // Medical Record Number
  urgency?: UrgencyLevel;
  room?: string;
  onClick?: () => void;
}

function getAge(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Compact patient summary card used in worklists, encounter lists, and triage queues.
 */
export function PatientCard({
  displayName,
  dateOfBirth,
  gender,
  mrn,
  urgency,
  room,
  onClick,
}: PatientCardProps) {
  const age = getAge(dateOfBirth);

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
        '&:hover': onClick ? { backgroundColor: 'action.hover' } : {},
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}>
        {initials(displayName)}
      </Avatar>

      <Stack flex={1} spacing={0.25}>
        <Typography variant="subtitle2" fontWeight={700} noWrap>
          {displayName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {age}y {gender ? `· ${gender}` : ''} {mrn ? `· MRN: ${mrn}` : ''}
        </Typography>
      </Stack>

      <Stack spacing={0.5} alignItems="flex-end">
        {urgency && <UrgencyChip level={urgency} showLabel={false} />}
        {room && (
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Room {room}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
