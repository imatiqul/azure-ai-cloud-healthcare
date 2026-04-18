import { useState, useEffect } from 'react';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { Card, CardContent } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface DashboardStats {
  label: string;
  value: number | string;
  color: string;
}

async function fetchSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const [agents, scheduling, popHealth, revenue] = await Promise.all([
        fetchSafe('/api/v1/agents/stats', { PendingTriage: 0, AwaitingReview: 0, Completed: 0 }),
        fetchSafe('/api/v1/scheduling/stats', { AvailableToday: 0, BookedToday: 0, TotalBookings: 0 }),
        fetchSafe('/api/v1/population-health/stats', { HighRiskPatients: 0, TotalPatients: 0, OpenCareGaps: 0, ClosedCareGaps: 0 }),
        fetchSafe('/api/v1/revenue/stats', { codingQueue: 0, codingReviewed: 0, codingSubmitted: 0, priorAuthsPending: 0, priorAuthsApproved: 0, priorAuthsDenied: 0 }),
      ]);

      setStats([
        { label: 'Pending Triage', value: agents.PendingTriage + agents.AwaitingReview, color: 'warning.main' },
        { label: 'Triage Completed', value: agents.Completed, color: 'success.main' },
        { label: 'Available Slots Today', value: scheduling.AvailableToday, color: 'primary.main' },
        { label: 'Booked Today', value: scheduling.BookedToday, color: 'success.main' },
        { label: 'High-Risk Patients', value: popHealth.HighRiskPatients, color: 'error.main' },
        { label: 'Open Care Gaps', value: popHealth.OpenCareGaps, color: 'warning.main' },
        { label: 'Coding Queue', value: revenue.codingQueue, color: 'secondary.main' },
        { label: 'Prior Auths Pending', value: revenue.priorAuthsPending, color: 'info.main' },
      ]);
      setLoading(false);
    }
    loadStats();
  }, []);

  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Dashboard
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {stats.map((stat) => (
            <Grid item xs={12} sm={6} md={3} key={stat.label}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: stat.color }}>
                    {stat.value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
