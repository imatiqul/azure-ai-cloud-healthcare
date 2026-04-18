import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface StatsData {
  HighRiskPatients: number;
  TotalPatients: number;
  OpenCareGaps: number;
  ClosedCareGaps: number;
}

const RISK_COLORS: Record<string, string> = {
  Critical: '#d32f2f',
  High: '#f57c00',
  Moderate: '#fbc02d',
  Low: '#388e3c',
};

export function RiskDistributionChart() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [riskCounts, setRiskCounts] = useState<{ level: string; count: number }[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, risksRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/population-health/stats`),
          fetch(`${API_BASE}/api/v1/population-health/risks?top=200`),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (risksRes.ok) {
          const risks: { level: string }[] = await risksRes.json();
          const counts = ['Critical', 'High', 'Moderate', 'Low'].map((level) => ({
            level,
            count: risks.filter((r) => r.level === level).length,
          }));
          setRiskCounts(counts);
        }
      } catch { /* API not available */ }
    }
    load();
  }, []);

  const maxCount = Math.max(...riskCounts.map((r) => r.count), 1);
  const totalGaps = stats ? stats.OpenCareGaps + stats.ClosedCareGaps : 0;
  const closureRate = totalGaps > 0 ? Math.round((stats!.ClosedCareGaps / totalGaps) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Population Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {riskCounts.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            Loading risk distribution...
          </Typography>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Risk Distribution
            </Typography>
            <Stack spacing={1} sx={{ mb: 3 }}>
              {riskCounts.map(({ level, count }) => (
                <Box key={level}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="caption">{level}</Typography>
                    <Typography variant="caption" fontWeight="bold">{count}</Typography>
                  </Stack>
                  <Box
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'grey.200',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${(count / maxCount) * 100}%`,
                        bgcolor: RISK_COLORS[level] || 'grey.500',
                        borderRadius: 4,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>

            {stats && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Care Gap Summary
                </Typography>
                <Stack direction="row" spacing={3}>
                  <Box textAlign="center">
                    <Typography variant="h5" fontWeight="bold" color="warning.main">
                      {stats.OpenCareGaps}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Open</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h5" fontWeight="bold" color="success.main">
                      {stats.ClosedCareGaps}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Addressed</Typography>
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h5" fontWeight="bold" color="primary.main">
                      {closureRate}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Closure Rate</Typography>
                  </Box>
                </Stack>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
