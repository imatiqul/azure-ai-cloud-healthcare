import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
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

interface CareGap {
  id: string;
  patientId: string;
  measureName: string;
  status: string;
  identifiedAt: string;
}

export function CareGapList() {
  const [gaps, setGaps] = useState<CareGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => { fetchGaps(); }, []);

  async function fetchGaps() {
    setFetchError(null);
    try {
      const data = await gqlFetch<{ careGaps: CareGap[] }>({ query: GET_CARE_GAPS });
      setGaps((data.careGaps ?? []).filter(g => g.status === 'Open'));
    } catch {
      setFetchError('Unable to load care gaps — check API connectivity.');
    } finally {
      setLoading(false);
    }
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
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!loading && (
          <>
            {fetchError && <Alert severity="error" sx={{ mb: 1.5 }}>{fetchError}</Alert>}
            {gaps.length === 0 && !fetchError ? (
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
