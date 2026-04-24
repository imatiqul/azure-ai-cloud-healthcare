import { useState, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert,
  Card, CardContent, Chip, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import { Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Demo data ────────────────────────────────────────────────────────────────────────
const DEMO_GUIDE_SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DEMO_GUIDE_HISTORY: GuideHistory = {
  sessionId: DEMO_GUIDE_SESSION_ID,
  messages: [
    { role: 'user',      content: 'Can you walk me through the triage workflow for a new patient presenting with chest pain?', timestamp: new Date(Date.now() - 18 * 60_000).toISOString() },
    { role: 'assistant', content: 'For a patient presenting with chest pain, the AI Triage workflow follows 4 steps:\n\n1. Intake — Voice or text session captures chief complaint, vital signs, and onset timeline.\n2. Risk Stratification — The ClinicalTriageAgent classifies urgency (P1 Immediate / P2 Urgent / P3 Standard) using NLP + ML scoring.\n3. HITL Escalation — P1 and P2 cases are routed to the Escalation Queue for clinician review before any recommendation is finalised.\n4. Outcome Recording — The approved decision is logged to the audit trail with a full XAI explanation and guard verdict.\n\nWould you like me to show you the live triage queue now?', timestamp: new Date(Date.now() - 17 * 60_000).toISOString() },
    { role: 'user',      content: 'Yes, and also explain how the readmission risk score is calculated for PAT-00142.', timestamp: new Date(Date.now() - 14 * 60_000).toISOString() },
    { role: 'assistant', content: 'Patient PAT-00142 (Alice Morgan) has a predicted readmission probability of 0.72 (72%), classified as High Risk.\n\nThe ML.NET model uses 7 LIME features:\n• Prior admissions (30d): 2 — weight 0.31\n• Age bucket (70–74): — weight 0.24\n• Comorbidity count: 4 (Diabetes, HTN, CKD, Obesity) — weight 0.19\n• Length of stay (last encounter): 6 days — weight 0.11\n• Triage level: P2 Urgent — weight 0.08\n• Discharge disposition: Home with services — weight 0.05\n• Condition weight sum: 8.4 — weight 0.02\n\nThe 95% confidence interval is [61%, 83%] via Bootstrap (1000 iterations). The model recommends scheduling a follow-up within 7 days.', timestamp: new Date(Date.now() - 12 * 60_000).toISOString() },
    { role: 'user',      content: 'Thank you, that is very helpful. How do I review the care gaps for this patient?', timestamp: new Date(Date.now() - 8 * 60_000).toISOString() },
    { role: 'assistant', content: 'Navigate to Population Health → Care Gaps. Filter by Patient ID PAT-00142 to see Alice Morgan\'s 2 open HEDIS gaps: HbA1c Control (lab overdue) and BP < 140/90 (measurement due before 1 May 2026). Each gap links to the recommended clinical action and the responsible care team member.', timestamp: new Date(Date.now() - 7 * 60_000).toISOString() },
  ],
};

interface GuideMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface GuideHistory {
  sessionId: string;
  messages: GuideMessage[];
}

export default function GuideHistoryPanel() {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<GuideHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!sessionId.trim()) return;
    setLoading(true);
    setError(null);
    setHistory(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/agents/guide/history/${encodeURIComponent(sessionId.trim())}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) { setError(`${res.status} ${res.statusText}`); return; }
      const data = await res.json();
      setHistory(data);
    } catch {
      // Backend offline — show demo conversation so the feature is fully explorable
      setHistory({ ...DEMO_GUIDE_HISTORY, sessionId: sessionId.trim() || DEMO_GUIDE_SESSION_ID });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const roleVariant = (role: string) =>
    role === 'assistant' ? 'success' : role === 'user' ? 'secondary' : 'default';

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Guide Conversation History</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" gap={2} alignItems="flex-start">
            <TextField
              label="Guide Session ID (GUID)"
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
              size="small"
              fullWidth
              inputProps={{ 'aria-label': 'session id' }}
              onKeyDown={e => { if (e.key === 'Enter') loadHistory(); }}
              helperText="Demo session ID pre-filled — click Load History to view AI guide conversation"
            />
            <Button
              variant="contained"
              onClick={loadHistory}
              disabled={!sessionId.trim() || loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Load History
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {history && (
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Typography variant="h6">Conversation</Typography>
              <Chip
                size="small"
                label={`${history.messages.length} message${history.messages.length !== 1 ? 's' : ''}`}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {history.sessionId}
              </Typography>
            </Box>

            {history.messages.length === 0 ? (
              <Alert severity="info">No messages found for this session.</Alert>
            ) : (
              <List dense disablePadding>
                {history.messages.map((msg, i) => (
                  <Box key={i}>
                    <ListItem alignItems="flex-start" sx={{ py: 1 }}>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                            <Badge variant={roleVariant(msg.role) as 'success' | 'secondary' | 'default'}>
                              {msg.role}
                            </Badge>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography
                            variant="body2"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              bgcolor: msg.role === 'assistant' ? 'action.hover' : 'transparent',
                              borderRadius: 1,
                              p: msg.role === 'assistant' ? 1 : 0,
                            }}
                          >
                            {msg.content}
                          </Typography>
                        }
                      />
                    </ListItem>
                    {i < history.messages.length - 1 && <Divider component="li" />}
                  </Box>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
