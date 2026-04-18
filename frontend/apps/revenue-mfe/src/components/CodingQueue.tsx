import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';

interface CodingItem {
  id: string;
  encounterId: string;
  patientId: string;
  patientName: string;
  suggestedCodes: string[];
  approvedCodes: string[];
  status: 'Pending' | 'InReview' | 'Approved' | 'Submitted';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_REVENUE_API_URL || '';

export function CodingQueue() {
  const [items, setItems] = useState<CodingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/coding-jobs`);
      if (res.ok) setItems(await res.json());
    } catch {
      /* API may not be available yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleReview = async (item: CodingItem) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/coding-jobs/${item.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedCodes: item.suggestedCodes, reviewedBy: 'current-user' }),
      });
      if (res.ok) fetchJobs();
    } catch { /* silent */ }
  };

  const handleSubmit = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/revenue/coding-jobs/${id}/submit`, { method: 'POST' });
      if (res.ok) fetchJobs();
    } catch { /* silent */ }
  };

  function getStatusVariant(status: string) {
    switch (status) {
      case 'Pending': return 'warning' as const;
      case 'InReview': return 'default' as const;
      case 'Approved': return 'success' as const;
      case 'Submitted': return 'secondary' as const;
      default: return 'default' as const;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ICD-10 Coding Queue</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No encounters pending coding
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {items.map((item) => (
              <Box key={item.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="body2" fontWeight="medium">{item.patientName}</Typography>
                    <Typography variant="caption" color="text.secondary">Encounter: {item.encounterId}</Typography>
                  </Box>
                  <Badge variant={getStatusVariant(item.status)}>
                    {item.status}
                  </Badge>
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
                  {(item.approvedCodes.length > 0 ? item.approvedCodes : item.suggestedCodes).map((code) => (
                    <Badge key={code} variant="outline">{code}</Badge>
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  {item.status === 'Pending' && (
                    <Button size="sm" variant="outline" onClick={() => handleReview(item)}>
                      Approve Codes
                    </Button>
                  )}
                  {item.status === 'Approved' && (
                    <Button size="sm" onClick={() => handleSubmit(item.id)}>
                      Submit Claim
                    </Button>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
