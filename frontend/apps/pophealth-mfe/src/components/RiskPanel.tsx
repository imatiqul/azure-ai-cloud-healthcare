import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';
import { gqlFetch } from '@healthcare/graphql-client';

const GET_PATIENT_RISKS = /* GraphQL */ `
  query GetPatientRisks {
    patientRisks {
      id
      patientId
      level
      riskScore
      assessedAt
    }
  }
`;

const DEMO_RISKS: PatientRisk[] = [
  { id: 'r-1',  patientId: 'PAT-00142', patientName: 'Alice Morgan',     level: 'Critical', riskScore: 94, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'r-2',  patientId: 'PAT-00278', patientName: 'James Chen',       level: 'Critical', riskScore: 91, assessedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: 'r-3',  patientId: 'PAT-00391', patientName: 'Robert Wilson',    level: 'High',     riskScore: 82, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'r-4',  patientId: 'PAT-00554', patientName: 'Maria Gonzalez',   level: 'High',     riskScore: 79, assessedAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'r-5',  patientId: 'PAT-00619', patientName: 'Sarah O\'Brien',   level: 'High',     riskScore: 76, assessedAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'r-6',  patientId: 'PAT-00731', patientName: 'David Kim',        level: 'Moderate', riskScore: 58, assessedAt: new Date(Date.now() - 5 * 86400_000).toISOString() },
  { id: 'r-7',  patientId: 'PAT-00842', patientName: 'Linda Patel',      level: 'Moderate', riskScore: 54, assessedAt: new Date(Date.now() - 4 * 86400_000).toISOString() },
  { id: 'r-8',  patientId: 'PAT-00953', patientName: 'Thomas Nguyen',    level: 'Low',      riskScore: 32, assessedAt: new Date(Date.now() - 7 * 86400_000).toISOString() },
];

interface PatientRisk {
  id: string;
  patientId: string;
  patientName?: string;
  level: string;
  riskScore: number;
  assessedAt: string;
}

export function RiskPanel() {
  const [allRisks, setAllRisks] = useState<PatientRisk[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all risks once via GraphQL BFF; filter client-side
  useEffect(() => {
    setLoading(true);
    setError(null);
    gqlFetch<{ patientRisks: PatientRisk[] }>({ query: GET_PATIENT_RISKS })
      .then(data => setAllRisks(data.patientRisks ?? []))
      .catch(() => {
        setError('Failed to load risk assessments — showing demo data');
        setAllRisks(DEMO_RISKS);
      })
      .finally(() => setLoading(false));
  }, []);

  const risks = useMemo(
    () => (filter ? allRisks.filter(r => r.level === filter) : allRisks),
    [allRisks, filter],
  );

  function getRiskBadge(level: string) {
    switch (level) {
      case 'Critical': return 'danger' as const;
      case 'High': return 'warning' as const;
      case 'Moderate': return 'default' as const;
      default: return 'success' as const;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <span>Patient Risk Stratification</span>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                displayEmpty
              >
                <MenuItem value="">All Levels</MenuItem>
                <MenuItem value="Critical">Critical</MenuItem>
                <MenuItem value="High">High</MenuItem>
                <MenuItem value="Moderate">Moderate</MenuItem>
                <MenuItem value="Low">Low</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <Stack spacing={1}>
            {[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={56} />)}
          </Stack>
        )}
        {!loading && (
          <>
            {error && <Alert severity="warning" sx={{ mb: 1.5 }}>{error}</Alert>}
            {risks.length === 0 ? (
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No risk assessments
          </Typography>
        ) : (
          <Stack spacing={1}>
            {risks.map((risk) => (
              <Box
                key={risk.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  border: 1,
                  borderColor: risk.level === 'Critical' ? 'error.light' : 'divider',
                  borderRadius: 1,
                  bgcolor: risk.level === 'Critical' ? 'error.50' : undefined,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {risk.patientName ?? risk.patientId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {risk.patientId} · Score {risk.riskScore}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Badge variant={getRiskBadge(risk.level)}>{risk.level}</Badge>
                  <Tooltip title={`Schedule follow-up for ${risk.patientName ?? risk.patientId}`}>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ height: 24, fontSize: '0.65rem', px: 1, minWidth: 0 }}
                      onClick={() => {
                        // Emit a scheduling intent — in full implementation this routes to scheduler
                        window.dispatchEvent(new CustomEvent('healthq:scheduleFollowUp', { detail: { patientId: risk.patientId } }));
                      }}
                    >
                      Intervene
                    </Button>
                  </Tooltip>
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
