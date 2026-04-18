import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import {
  createGlobalVoiceClient,
  disposeGlobalVoiceClient,
  type VoiceSessionClient,
  type AiThinkingMessage,
  type AgentResponseMessage,
} from '@healthcare/web-pubsub-client';
import { emitAgentDecision, emitEscalationRequired } from '@healthcare/mfe-events';
import { AiThinkingPanel } from './AiThinkingPanel';

type SessionStatus = 'idle' | 'connecting' | 'live' | 'ended';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_TRANSCRIPTS = [
  "Patient reports severe chest pain radiating to the left arm for the past 30 minutes, shortness of breath, and sweating.",
  "Patient has a fever of 39.5\u00b0C for 3 days, sore throat, difficulty swallowing, and swollen lymph nodes.",
  "Patient complains of a persistent headache for 2 days, blurred vision, and mild nausea. No prior history.",
  "Patient has abdominal pain in the lower right quadrant, started 6 hours ago and is getting worse. Rebound tenderness present.",
  "Patient with known Type 2 diabetes reports blood sugar of 320 mg/dL, excessive thirst, and frequent urination.",
];

interface TriageResult {
  id: string;
  assignedLevel: string;
  agentReasoning: string;
}

export function VoiceSessionController() {
  const [status, setStatus]                   = useState<SessionStatus>('idle');
  const [sessionId, setSessionId]             = useState<string | null>(null);
  const [triage, setTriage]                   = useState<string | null>(null);
  const [transcriptText, setTranscriptText]   = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [triageResult, setTriageResult]       = useState<TriageResult | null>(null);
  const [pubSubConnected, setPubSubConnected] = useState(false);

  // AI thinking / streaming state
  const [aiThinkingText, setAiThinkingText] = useState('');
  const [aiStreaming, setAiStreaming]       = useState(false);
  const [aiDone, setAiDone]               = useState(false);

  const clientRef = useRef<VoiceSessionClient | null>(null);

  // -- Azure Web PubSub lifecycle ---------------------------------------------
  const connectPubSub = useCallback(async (sid: string) => {
    try {
      const client = await createGlobalVoiceClient(API_BASE, sid);
      clientRef.current = client;

      client.onMessage((msg) => {
        switch (msg.type) {
          case 'AiThinking': {
            const m = msg as AiThinkingMessage;
            setAiStreaming(true);
            if (m.token) setAiThinkingText((prev) => prev + m.token);
            if (m.isFinal) { setAiStreaming(false); setAiDone(true); }
            break;
          }
          case 'AgentResponse': {
            const m = msg as AgentResponseMessage;
            const level = m.triageLevel ?? 'Unknown';
            setTriage(level);
            setTriageResult({ id: sid, assignedLevel: level, agentReasoning: m.text });
            emitAgentDecision({ sessionId: sid, triageLevel: level, reasoning: m.text });
            break;
          }
          case 'EscalationRequired':
            emitEscalationRequired({ sessionId: sid });
            break;
          case 'TranscriptReceived':
            setTranscriptText((prev) => prev ? `${prev} ${msg.text}` : msg.text);
            break;
          default:
            break;
        }
      });

      client.onConnected(() => setPubSubConnected(true));
      client.onDisconnected(() => setPubSubConnected(false));
      client.onReconnecting(() => setPubSubConnected(false));

      await client.start();
      await client.joinSession(sid);
      setPubSubConnected(true);
    } catch {
      // Web PubSub unavailable in dev -- degrade gracefully
      setPubSubConnected(false);
    }
  }, []);

  const disconnectPubSub = useCallback(async () => {
    clientRef.current = null;
    setPubSubConnected(false);
    await disposeGlobalVoiceClient();
  }, []);

  useEffect(() => {
    return () => { void disconnectPubSub(); };
  }, [disconnectPubSub]);

  // -- Session control --------------------------------------------------------
  async function startSession() {
    setStatus('connecting');
    setTriageResult(null);
    setAiThinkingText('');
    setAiStreaming(false);
    setAiDone(false);
    try {
      const res = await fetch(`${API_BASE}/api/v1/voice/sessions`, {
        method: 'POST',
        body: JSON.stringify({ patientId: '00000000-0000-0000-0000-000000000001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { id: string };
      setSessionId(data.id);
      setStatus('live');
      await connectPubSub(data.id);
    } catch {
      setStatus('idle');
    }
  }

  async function endSession() {
    if (!sessionId) return;
    await fetch(`${API_BASE}/api/v1/voice/sessions/${sessionId}/end`, { method: 'POST' });
    setStatus('ended');
    await disconnectPubSub();
  }

  async function submitForTriage() {
    if (!sessionId || !transcriptText.trim()) return;
    setSubmitting(true);
    setTriageResult(null);
    setAiThinkingText('');
    setAiStreaming(false);
    setAiDone(false);
    try {
      await fetch(`${API_BASE}/api/v1/voice/sessions/${sessionId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptText }),
      });

      const triageRes = await fetch(`${API_BASE}/api/v1/agents/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, transcriptText }),
      });
      const result = await triageRes.json() as { assignedLevel: string; agentReasoning: string };

      // When Web PubSub is NOT connected, use the HTTP response directly
      if (!pubSubConnected) {
        const level = result.assignedLevel ?? 'Unknown';
        setTriage(level);
        setTriageResult({ id: sessionId, assignedLevel: level, agentReasoning: result.agentReasoning });
        emitAgentDecision({ sessionId, triageLevel: level, reasoning: result.agentReasoning });
      }
      // When Web PubSub IS connected, AgentResponse + AiThinking messages update state
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Voice Session</span>
            {status !== 'idle' && (
              <Badge variant={status === 'live' ? 'success' : status === 'ended' ? 'secondary' : 'warning'}>
                {status}
              </Badge>
            )}
            {triage && (
              <Badge variant={triage === 'P1_Immediate' ? 'danger' : triage === 'P2_Urgent' ? 'warning' : 'success'}>
                {triage}
              </Badge>
            )}
            {pubSubConnected && (
              <Chip label="Web PubSub Live" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />
            )}
          </Stack>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <Button onClick={startSession} disabled={status !== 'idle' && status !== 'ended'}>
              Start Session
            </Button>
            <Button onClick={endSession} variant="destructive" disabled={status !== 'live'}>
              End Session
            </Button>
          </Stack>

          {status === 'connecting' && <LinearProgress />}

          {status === 'live' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Enter patient transcript for AI triage analysis:
              </Typography>
              <TextField
                multiline
                rows={4}
                fullWidth
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="e.g. Patient reports chest pain, shortness of breath..."
                size="small"
                sx={{ mb: 1 }}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                {DEMO_TRANSCRIPTS.map((t, i) => (
                  <Box
                    key={i}
                    component="span"
                    onClick={() => setTranscriptText(t)}
                    sx={{
                      px: 1, py: 0.5, fontSize: 11, border: 1, borderRadius: 1,
                      borderColor: 'divider', cursor: 'pointer',
                      '&:hover': { bgcolor: 'primary.50' },
                    }}
                  >
                    Demo {i + 1}
                  </Box>
                ))}
              </Stack>
              <Button
                onClick={submitForTriage}
                disabled={submitting || !transcriptText.trim()}
              >
                {submitting ? 'Contacting AI...' : 'Submit for AI Triage'}
              </Button>
            </Box>
          )}

          {/* Real-time AI thinking panel - shows streaming OpenAI reasoning */}
          <AiThinkingPanel
            thinkingText={aiThinkingText}
            isStreaming={aiStreaming}
            isDone={aiDone}
          />

          {triageResult && (
            <Alert
              severity={
                triageResult.assignedLevel === 'P1_Immediate' ? 'error' :
                triageResult.assignedLevel === 'P2_Urgent' ? 'warning' : 'success'
              }
            >
              <Typography variant="body2" fontWeight="bold">
                Triage Result: {triageResult.assignedLevel}
              </Typography>
              {triageResult.agentReasoning && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {triageResult.agentReasoning}
                </Typography>
              )}
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}