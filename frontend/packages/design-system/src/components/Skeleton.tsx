import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

interface SkeletonCardProps {
  lines?: number;
  height?: number;
}

/** Single card skeleton with a title bar + content lines */
export function SkeletonCard({ lines = 3, height = 32 }: SkeletonCardProps) {
  return (
    <Box
      sx={{
        p: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Skeleton variant="rectangular" width="45%" height={18} sx={{ borderRadius: 1, mb: 2 }} />
      <Stack spacing={1}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            width={i === lines - 1 ? '70%' : '100%'}
            height={height}
            sx={{ borderRadius: 1 }}
          />
        ))}
      </Stack>
    </Box>
  );
}

interface SkeletonListProps {
  rows?: number;
}

/** Row-list skeleton (worklist, table rows) */
export function SkeletonList({ rows = 5 }: SkeletonListProps) {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: rows }).map((_, i) => (
        <Stack key={i} direction="row" alignItems="center" spacing={2}>
          <Skeleton variant="circular" width={36} height={36} />
          <Box flex={1}>
            <Skeleton variant="rectangular" width="55%" height={14} sx={{ borderRadius: 1, mb: 0.75 }} />
            <Skeleton variant="rectangular" width="35%" height={12} sx={{ borderRadius: 1 }} />
          </Box>
          <Skeleton variant="rectangular" width={60} height={22} sx={{ borderRadius: 1 }} />
        </Stack>
      ))}
    </Stack>
  );
}

interface SkeletonStatGridProps {
  count?: number;
}

/** Grid of stat card skeletons for the dashboard */
export function SkeletonStatGrid({ count = 8 }: SkeletonStatGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 2,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}
        >
          <Stack direction="row" justifyContent="space-between" mb={1.5}>
            <Skeleton variant="rectangular" width="55%" height={14} sx={{ borderRadius: 1 }} />
            <Skeleton variant="circular" width={28} height={28} />
          </Stack>
          <Skeleton variant="rectangular" width="40%" height={32} sx={{ borderRadius: 1, mb: 0.75 }} />
          <Skeleton variant="rectangular" width="60%" height={12} sx={{ borderRadius: 1 }} />
        </Box>
      ))}
    </Box>
  );
}
