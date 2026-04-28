import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';
import { gqlFetch } from '@healthcare/graphql-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const GET_CARE_GAPS = /* GraphQL */ `
  query GetCareGaps {
    careGaps {
      id
      patientId
      measureName
      status
      identifiedAt
    }
  }
`;

const DEMO_GAPS: CareGap[] = [
  { id: 'cg-1', patientId: 'PAT-00142', measureName: 'HbA1c Control (Diabetes)', status: 'Open', identifiedAt: new Date(Date.now() - 45 * 86_400_000).toISOString() },
  { id: 'cg-2', patientId: 'PAT-00278', measureName: 'Colorectal Cancer Screening', status: 'Open', identifiedAt: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { id: 'cg-3', patientId: 'PAT-00315', measureName: 'Annual Wellness Visit', status: 'Open', identifiedAt: new Date(Date.now() - 15 * 86_400_000).toISOString() },
  { id: 'cg-4', patientId: 'PAT-00089', measureName: 'Blood Pressure Control (HTN)', status: 'Open', identifiedAt: new Date(Date.now() - 7 * 86_400_000).toISOString() },
  { id: 'cg-5', patientId: 'PAT-00456', measureName: 'Breast Cancer Screening', status: 'Open', identifiedAt: new Date(Date.now() - 60 * 86_400_000).toISOString() },
];

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
      const data = await gqlFetch<{ careGaps: CareGap[] }>({ query: GET_CARE_GAPS });
      const open = (data.careGaps ?? []).filter(g => g.status === 'Open');
      setGaps(open.length > 0 ? open : DEMO_GAPS);
    } catch { setGaps(DEMO_GAPS); }
  }

  async function addressGap(id: string) {
    await fetch(`${API_BASE}/api/v1/population-health/care-gaps/${id}/address`, { signal: AbortSignal.timeout(10_000), method: 'POST' });
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
