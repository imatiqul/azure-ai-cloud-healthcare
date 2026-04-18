import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface PatientRisk {
  id: string;
  patientId: string;
  level: string;
  riskScore: number;
  assessedAt: string;
}

export function RiskPanel() {
  const [risks, setRisks] = useState<PatientRisk[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchRisks();
  }, [filter]);

  async function fetchRisks() {
    try {
      const query = filter ? `?riskLevel=${filter}&top=20` : '?top=20';
      const res = await fetch(`${API_BASE}/api/v1/population-health/risks${query}`);
      const data = await res.json();
      setRisks(data);
    } catch { /* no-op */ }
  }

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
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    Patient {risk.patientId.substring(0, 8)}...
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Score: {risk.riskScore.toFixed(2)}
                  </Typography>
                </Box>
                <Badge variant={getRiskBadge(risk.level)}>{risk.level}</Badge>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
