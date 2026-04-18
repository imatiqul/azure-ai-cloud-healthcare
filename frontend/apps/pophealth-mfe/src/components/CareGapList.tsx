import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface CareGap {
  id: string;
  patientId: string;
  measureName: string;
  status: string;
  identifiedAt: string;
}

export function CareGapList() {
  const [gaps, setGaps] = useState<CareGap[]>([]);

  useEffect(() => { fetchGaps(); }, []);

  async function fetchGaps() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/population-health/care-gaps?status=Open`);
      const data = await res.json();
      setGaps(data);
    } catch { /* no-op */ }
  }

  async function addressGap(id: string) {
    await fetch(`${API_BASE}/api/v1/population-health/care-gaps/${id}/address`, { method: 'POST' });
    fetchGaps();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Care Gaps</CardTitle>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No open care gaps
          </Typography>
        ) : (
          <Stack spacing={1}>
            {gaps.map((gap) => (
              <Box
                key={gap.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium">{gap.measureName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Patient {gap.patientId.substring(0, 8)}... | {new Date(gap.identifiedAt).toLocaleDateString()}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Badge variant="warning">{gap.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => addressGap(gap.id)}>
                    Address
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
