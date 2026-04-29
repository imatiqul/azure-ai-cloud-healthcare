import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@healthcare/design-system';
import {
  emitSlotReserved,
  getActiveWorkflowHandoff,
  getLatestWorkflowHandoff,
  getWorkflowHandoff,
  onTriageApproved,
  setActiveWorkflow,
  selectShellTab,
  upsertWorkflowHandoff,
} from '@healthcare/mfe-events';
import { syncWorkflowReserve } from '../lib/workflowSync';
import { useAuthFetch } from '@healthcare/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function makeDemoSlots(date: string): Slot[] {
  const base = new Date(`${date}T08:00:00`);
  return Array.from({ length: 8 }, (_, i) => ({
    id: `demo-slot-${i}`,
    practitionerId: `DR-${(i % 3) + 1}`,
    startTime: new Date(base.getTime() + i * 30 * 60_000).toISOString(),
    endTime:   new Date(base.getTime() + (i + 1) * 30 * 60_000).toISOString(),
    status: 'Available',
    aiRecommended: i === 1 || i === 4, // 9:00am and 10:00am are AI-recommended
  }));
}

interface Slot {
  id: string;
  practitionerId: string;
  startTime: string;
  endTime: string;
  status: string;
  aiRecommended?: boolean;
}

export function SlotCalendar() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [workflowContext, setWorkflowContext] = useState(() => getActiveWorkflowHandoff() ?? getLatestWorkflowHandoff());
  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchSlots();
  }, [selectedDate]);

  useEffect(() => {
    setWorkflowContext(getActiveWorkflowHandoff() ?? getLatestWorkflowHandoff());

    const off = onTriageApproved(({ detail }) => {
      setActiveWorkflow(detail.workflowId);
      setWorkflowContext(
        getWorkflowHandoff(detail.workflowId)
        ?? getWorkflowHandoff(detail.sessionId)
        ?? getActiveWorkflowHandoff()
        ?? getLatestWorkflowHandoff(),
      );
    });

    return off;
  }, []);

  async function fetchSlots() {
    setFetchError(null);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/scheduling/slots?date=${selectedDate}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setSlots(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setFetchError('Could not load slots — showing demo data');
        setSlots(makeDemoSlots(selectedDate));
      }
    }
  }

  async function reserveSlot(slotId: string) {
    setReserveError(null);
    const selectedSlot = slots.find((slot) => slot.id === slotId);
    const activeContext = getActiveWorkflowHandoff();
    const currentContext = activeContext
      ?? (workflowContext?.workflowId
        ? getWorkflowHandoff(workflowContext.workflowId)
        : workflowContext?.sessionId
        ? getWorkflowHandoff(workflowContext.sessionId)
        : getLatestWorkflowHandoff());
    const patientId = currentContext?.patientId;
    const practitionerId = selectedSlot?.practitionerId ?? currentContext?.practitionerId;

    if (currentContext) {
      const updated = upsertWorkflowHandoff({
        ...currentContext,
        practitionerId,
        slotId,
        status: 'Scheduling',
        updatedAt: new Date().toISOString(),
      });
      setActiveWorkflow(updated.workflowId);
      setWorkflowContext(updated);
      void syncWorkflowReserve(updated, {
        slotId,
        patientId: updated.patientId,
        patientName: updated.patientName,
        practitionerId,
      }, authFetch);
    }

    // Demo slots resolve locally — no backend needed
    if (slotId.startsWith('demo-slot-')) {
      emitSlotReserved({ slotId, patientId, practitionerId });
      selectShellTab('hq:tab-scheduling', 1);
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, status: 'Reserved' } : s));
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/api/v1/scheduling/slots/${slotId}/reserve`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Reservation failed (${res.status})`);
      emitSlotReserved({ slotId, patientId, practitionerId });
      selectShellTab('hq:tab-scheduling', 1);
      fetchSlots();
    } catch {
      // Backend offline — apply locally and notify user
      setReserveError('Slot reservation failed — applied locally.');
      emitSlotReserved({ slotId, patientId, practitionerId });
      selectShellTab('hq:tab-scheduling', 1);
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, status: 'Reserved' } : s));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <span>Available Slots</span>
            <TextField
              type="date"
              size="small"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              sx={{ width: 180 }}
            />
          </Stack>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {workflowContext?.patientId && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Scheduling appointment for {workflowContext.patientName ?? workflowContext.patientId}.
          </Alert>
        )}
        {fetchError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setFetchError(null)}>{fetchError}</Alert>}
        {reserveError && <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setReserveError(null)}>{reserveError}</Alert>}
        {!fetchError && slots.length === 0 ? (
          <Stack spacing={1} alignItems="center" sx={{ py: 4 }}>
            <Typography color="text.disabled" textAlign="center">
              No available slots for this date
            </Typography>
            <Button size="sm" variant="outline" onClick={() => selectShellTab('hq:tab-scheduling', 2)}>
              Open Waitlist
            </Button>
          </Stack>
        ) : (
          <Grid container spacing={1}>
            {slots.map((slot) => (
              <Grid size={6} key={slot.id}>
                <Box
                  role="button"
                  tabIndex={0}
                  aria-label={`Reserve slot ${slot.id}`}
                  onClick={() => reserveSlot(slot.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void reserveSlot(slot.id);
                    }
                  }}
                  sx={{
                    p: 1.5,
                    border: slot.aiRecommended ? '2px solid' : 1,
                    borderColor: slot.aiRecommended ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: slot.aiRecommended ? 'primary.50' : undefined,
                    position: 'relative',
                    '&:hover': { bgcolor: 'primary.100' },
                  }}
                >
                  {slot.aiRecommended && (
                    <Chip
                      icon={<AutoAwesomeIcon sx={{ fontSize: '11px !important' }} />}
                      label="AI Pick"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, position: 'absolute', top: 4, right: 4 }}
                    />
                  )}
                  <Typography variant="body2" fontWeight="medium">
                    {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                    <Badge variant="success">{slot.status}</Badge>
                    <Typography variant="caption" color="text.secondary">{slot.practitionerId}</Typography>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
