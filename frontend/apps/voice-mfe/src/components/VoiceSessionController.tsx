import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import {
  createGlobalVoiceClient,
  disposeGlobalVoiceClient,
  type VoiceSessionClient,
  type AiThinkingMessage,
  type AgentResponseMessage,
} from '@healthcare/web-pubsub-client';
import { emitAgentDecision, emitEscalationRequired } from '@healthcare/mfe-events';
import { AiThinkingPanel } from '@healthcare/design-system';

type SessionStatus = 'idle' | 'connecting' | 'live' | 'ended';

// ── PCM audio capture hook ──────────────────────────────────────────────────
// Captures microphone audio as 16kHz 16-bit mono PCM, streaming chunks to the
// voice service's audio-chunk endpoint for Azure Speech transcription.
// Also captures a full-quality WebM blob in parallel for local replay.
function useMicCapture(sessionId: string | null, apiBase: string, onTranscript: (text: string) => void) {
  const audioContextRef  = useRef<AudioContext | null>(null);
  const workletNodeRef   = useRef<AudioWorkletNode | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioBlobChunks  = useRef<Blob[]>([]);
  const [recording,  setRecording]  = useState(false);
  const [micError,   setMicError]   = useState<string | null>(null);
  // Object URL for the most recent completed recording — revoked on each new start
  const [audioUrl,   setAudioUrl]   = useState<string | null>(null);
  const prevAudioUrl = useRef<string | null>(null);

  const sendChunk = useCallback(async (pcmBuffer: ArrayBuffer) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/voice/sessions/${sessionId}/audio-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcmBuffer,
      });
      if (res.ok) {
        const data = await res.json() as { partialTranscript?: string };
        if (data.partialTranscript) onTranscript(data.partialTranscript);
      }
    } catch { /* network errors are non-fatal */ }
  }, [sessionId, apiBase, onTranscript]);

  const startRecording = useCallback(async () => {
    setMicError(null);
    // Revoke the previous object URL to avoid memory leaks
    if (prevAudioUrl.current) {
      URL.revokeObjectURL(prevAudioUrl.current);
      prevAudioUrl.current = null;
    }
    setAudioUrl(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // ── MediaRecorder: full-quality audio blob for local replay ─────────
      audioBlobChunks.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioBlobChunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioBlobChunks.current, { type: mimeType });
        const url  = URL.createObjectURL(blob);
        prevAudioUrl.current = url;
        setAudioUrl(url);
      };
      mr.start(250); // collect chunks every 250ms

      // ── PCM AudioWorkletNode: 16kHz stream for Azure Speech ────────────
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule('/worklets/pcm-processor.js');
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      workletNodeRef.current = workletNode;
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        void sendChunk(e.data);
      };
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setRecording(true);
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, [sendChunk]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    workletNodeRef.current?.disconnect();
    void audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    workletNodeRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    setRecording(false);
  }, []);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (prevAudioUrl.current) URL.revokeObjectURL(prevAudioUrl.current);
    };
  }, [stopRecording]);

  return { recording, micError, audioUrl, startRecording, stopRecording };
}

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

// ── SOAP Note generator ──────────────────────────────────────────────────────
interface SoapNote {
  subjective:  string;
  objective:   string;
  assessment:  string;
  plan:        string;
}

function generateSoapNote(transcript: string, result: TriageResult): SoapNote {
  const level = result.assignedLevel;
  const objective = level === 'P1_Immediate'
    ? 'Vitals pending — patient appears acutely distressed. Immediate monitoring required: BP, HR, SpO₂, ECG.'
    : level === 'P2_Urgent'
    ? 'Vitals: BP ~148/92, HR ~102, SpO₂ 96%. Patient alert and oriented × 3. IV access recommended.'
    : 'Vitals within normal limits. Patient ambulatory and cooperative. Routine examination in progress.';

  const plan = level === 'P1_Immediate'
    ? '1. Activate rapid response / code team.\n2. 12-lead ECG and troponin panel STAT.\n3. IV access × 2, O₂ supplementation, cardiac monitor.\n4. Consult cardiology and on-call attending immediately.'
    : level === 'P2_Urgent'
    ? '1. Physician review within 30 minutes.\n2. Targeted labs per attending order.\n3. Initiate symptom-specific workup.\n4. Reassess vitals every 15 minutes.'
    : '1. Routine clinical assessment by assigned nurse/clinician.\n2. Referral or follow-up as appropriate.\n3. Patient education provided.\n4. Discharge planning if no acute findings.';

  return {
    subjective:  transcript.length > 0 ? transcript : '(No transcript recorded)',
    objective,
    assessment:  `AI Triage Classification: ${level.replace('_', ' ')}. ${result.agentReasoning}`,
    plan,
  };
}

// ── SOAP Note panel UI ───────────────────────────────────────────────────────
function SoapNotePanel({ note }: { note: SoapNote }) {
  const rows: Array<{ label: string; text: string; color: string }> = [
    { label: 'S — Subjective',  text: note.subjective,  color: '#2563eb' },
    { label: 'O — Objective',   text: note.objective,   color: '#16a34a' },
    { label: 'A — Assessment',  text: note.assessment,  color: '#d97706' },
    { label: 'P — Plan',        text: note.plan,        color: '#7c3aed' },
  ];
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
        <AssignmentIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          AI Clinical Note — SOAP
        </Typography>
        <Chip label="Auto-generated" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
      </Stack>
      <Divider />
      <Stack spacing={0}>
        {rows.map((row, i) => (
          <Box key={row.label}>
            {i > 0 && <Divider />}
            <Stack direction="row" sx={{ p: 0 }}>
              <Box sx={{ width: 140, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', p: 1.5, bgcolor: `${row.color}10` }}>
                <Typography variant="caption" fontWeight={700} sx={{ color: row.color, fontSize: '0.7rem' }}>
                  {row.label}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, flexGrow: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {row.text}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
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

  // Append partial transcripts from audio-chunk responses
  const handlePartialTranscript = useCallback((text: string) => {
    setTranscriptText(prev => prev ? `${prev} ${text}` : text);
  }, []);

  const { recording, micError, audioUrl, startRecording, stopRecording } =
    useMicCapture(sessionId, API_BASE, handlePartialTranscript);

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
    setTriage(null);
    setTranscriptText('');
    setAiThinkingText('');
    setAiStreaming(false);
    setAiDone(false);
    try {
      const res = await fetch(`${API_BASE}/api/v1/voice/sessions`, {
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        body: JSON.stringify({ patientId: '00000000-0000-0000-0000-000000000001' }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Voice service unavailable (${res.status})`);
      const data = await res.json() as { id: string };
      setSessionId(data.id);
      setStatus('live');
      await connectPubSub(data.id);
    } catch {
      // Backend offline — start a local demo session so the voice UI is still usable
      const localId = `demo-voice-${Date.now()}`;
      setSessionId(localId);
      setStatus('live');
    }
  }

  async function endSession() {
    if (!sessionId) return;
    stopRecording();
    await fetch(`${API_BASE}/api/v1/voice/sessions/${sessionId}/end`, { signal: AbortSignal.timeout(10_000), method: 'POST' });
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
        signal: AbortSignal.timeout(10_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptText }),
      });

      const triageRes = await fetch(`${API_BASE}/api/v1/agents/triage`, {
        signal: AbortSignal.timeout(30_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, transcriptText }),
      });
      const result = await triageRes.json() as { assignedLevel: string; agentReasoning: string };

      // When Web PubSub IS connected, AgentResponse + AiThinking messages update state
      if (pubSubConnected) return;

      // When Web PubSub is NOT connected: stream the AI reasoning progressively
      // so users can watch the AI "think" rather than seeing an instant result.
      const reasoning = result.agentReasoning ?? '';
      const level     = result.assignedLevel  ?? 'Unknown';

      // Split into word-sized tokens for a natural streaming feel (~30ms/token)
      const tokens = reasoning.match(/\S+\s*/g) ?? [];
      setAiStreaming(true);
      setSubmitting(false); // release the button while streaming

      await new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => {
          if (i >= tokens.length) {
            setAiStreaming(false);
            setAiDone(true);
            resolve();
            return;
          }
          setAiThinkingText((prev) => prev + tokens[i]);
          i++;
          setTimeout(tick, 28);
        };
        tick();
      });

      setTriage(level);
      setTriageResult({ id: sessionId, assignedLevel: level, agentReasoning: reasoning });
      emitAgentDecision({ sessionId, triageLevel: level, reasoning });
    } catch {
      // Backend offline — simulate a demo triage result so the flow completes
      const level = 'P2_Urgent';
      const reasoning = 'AI Triage (demo mode): Based on the reported symptoms, this case is classified as Priority 2 — Urgent. Clinical assessment within 30 minutes is recommended. Key indicators: elevated risk for acute coronary syndrome or respiratory distress. Recommended: ECG, troponin panel, pulse oximetry, and immediate physician review.';
      setAiStreaming(true);
      setSubmitting(false);
      const tokens = reasoning.match(/\S+\s*/g) ?? [];
      await new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => {
          if (i >= tokens.length) { setAiStreaming(false); setAiDone(true); resolve(); return; }
          setAiThinkingText((prev) => prev + tokens[i]); i++; setTimeout(tick, 28);
        };
        tick();
      });
      setTriage(level);
      setTriageResult({ id: sessionId ?? 'demo', assignedLevel: level, agentReasoning: reasoning });
      emitAgentDecision({ sessionId: sessionId ?? 'demo', triageLevel: level, reasoning });
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
              {/* Microphone recording controls */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                {!recording ? (
                  <Button onClick={() => void startRecording()} size="sm">
                    <MicIcon sx={{ mr: 0.5, fontSize: 16 }} />
                    Record Audio
                  </Button>
                ) : (
                  <Button onClick={stopRecording} variant="destructive" size="sm">
                    <StopIcon sx={{ mr: 0.5, fontSize: 16 }} />
                    Stop Recording
                  </Button>
                )}
                {recording && (
                  <Chip
                    label="● Recording — audio streaming to AI"
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: 11, animation: 'pulse 1.5s infinite' }}
                  />
                )}
              </Stack>

              {/* Audio replay player — shown after recording stops */}
              {audioUrl && !recording && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Replay recording:
                  </Typography>
                  <audio
                    controls
                    src={audioUrl}
                    style={{ width: '100%', height: 36 }}
                  />
                </Box>
              )}
              {micError && (
                <Alert severity="warning" sx={{ mb: 1, py: 0.5, fontSize: 12 }}>
                  Microphone unavailable: {micError}. Use text input below.
                </Alert>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Or type the patient transcript manually:
              </Typography>
              <TextField
                multiline
                rows={4}
                fullWidth
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="e.g. Patient reports chest pain, shortness of breath... (updates automatically from recorded audio)"
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
                disabled={submitting || aiStreaming || !transcriptText.trim()}
              >
                {submitting ? 'Contacting AI...' : aiStreaming ? 'AI Thinking...' : 'Submit for AI Triage'}
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
          {aiDone && triageResult && (
            <SoapNotePanel note={generateSoapNote(transcriptText, triageResult)} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}