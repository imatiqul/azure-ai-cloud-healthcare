import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: string;
  description: string;
}

interface InteractionResult {
  drugs: string[];
  alertLevel: string;
  hasContraindication: boolean;
  hasMajorInteraction: boolean;
  interactionCount: number;
  interactions: DrugInteraction[];
}

function alertBadgeVariant(level: string): 'error' | 'warning' | 'success' {
  if (level === 'Contraindicated' || level === 'Major') return 'error';
  if (level === 'Moderate') return 'warning';
  return 'success';
}

export function DrugInteractionChecker() {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [drugInput, setDrugInput] = useState('');
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addDrug = () => {
    const trimmed = drugInput.trim();
    if (trimmed && !drugs.includes(trimmed)) {
      setDrugs(prev => [...prev, trimmed]);
      setDrugInput('');
    }
  };

  const removeDrug = (drug: string) => setDrugs(prev => prev.filter(d => d !== drug));

  const handleCheck = async () => {
    if (drugs.length < 2) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/population-health/drug-interactions/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugs }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to check interactions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardHeader>
          <CardTitle>Drug Interaction Checker</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1, minHeight: 32 }}>
            {drugs.map(d => (
              <Chip
                key={d}
                label={d}
                onDelete={() => removeDrug(d)}
                color="primary"
                variant="outlined"
                size="small"
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Add drug name"
              value={drugInput}
              onChange={e => setDrugInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDrug()}
              size="small"
              placeholder="e.g. Warfarin"
              sx={{ flexGrow: 1 }}
            />
            <Button variant="outline" onClick={addDrug}>
              Add
            </Button>
          </Box>

          {drugs.length > 0 && drugs.length < 2 && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Add at least 2 drugs to check interactions.
            </Typography>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <Button onClick={handleCheck} disabled={drugs.length < 2 || loading}>
            {loading ? 'Checking…' : 'Check Interactions'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Interaction Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Badge variant={alertBadgeVariant(result.alertLevel)}>
                Alert: {result.alertLevel}
              </Badge>
              {result.hasContraindication && <Badge variant="error">Contraindicated</Badge>}
              {result.hasMajorInteraction && <Badge variant="warning">Major Interaction</Badge>}
              <Chip label={`${result.interactionCount} interaction(s)`} variant="outlined" size="small" />
            </Box>

            {result.interactions.length === 0 ? (
              <Alert severity="success">No significant interactions detected.</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Drug Pair</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.interactions.map((ix, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {ix.drug1} + {ix.drug2}
                      </TableCell>
                      <TableCell>
                        <Badge variant={alertBadgeVariant(ix.severity)}>{ix.severity}</Badge>
                      </TableCell>
                      <TableCell>{ix.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
