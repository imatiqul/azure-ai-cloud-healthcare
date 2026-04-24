import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface CareGap {
  id: string;
  patientId: string;
  gapType: string;
  description: string;
  status: string;
  identifiedAt: string;
  resolvedAt?: string;
}

interface Props {
  patientId: string;
}

export function CareGapSummary({ patientId }: Props) {
  const [gaps, setGaps] = useState<CareGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/v1/population-health/care-gaps?patientId=${encodeURIComponent(patientId)}`, { signal: AbortSignal.timeout(10_000) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CareGap[]>;
      })
      .then(setGaps)
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Typography color="text.secondary">Loading care gaps…</Typography>;
  if (error)   return <Typography color="error">{error}</Typography>;

  const open   = gaps.filter((g) => g.status === 'Open');
  const closed = gaps.filter((g) => g.status !== 'Open');

  if (gaps.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No care gaps identified for this patient
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {open.length > 0 && (
        <>
          <Typography variant="subtitle2" color="warning.main">
            Open Care Gaps ({open.length})
          </Typography>
          {open.map((gap) => (
            <Card key={gap.id}>
              <CardHeader>
                <CardTitle>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <span>{gap.gapType}</span>
                    <Badge variant="warning">Open</Badge>
                  </Stack>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Typography variant="body2">{gap.description}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Identified: {new Date(gap.identifiedAt).toLocaleDateString()}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {closed.length > 0 && (
        <>
          <Typography variant="subtitle2" color="success.main">
            Resolved Care Gaps ({closed.length})
          </Typography>
          {closed.map((gap) => (
            <Card key={gap.id}>
              <CardHeader>
                <CardTitle>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <span>{gap.gapType}</span>
                    <Chip label={gap.status} size="small" color="success" />
                  </Stack>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Typography variant="body2">{gap.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Stack>
  );
}
