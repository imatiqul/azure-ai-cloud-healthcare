import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@healthcare/design-system';
import {
  createGlobalVoiceClient,
  disposeGlobalVoiceClient,
  hasGlobalVoiceClient,
  type AgentResponseMessage,
  type TranscriptReceivedMessage,
} from '@healthcare/web-pubsub-client';
import { onAgentDecision } from '@healthcare/mfe-events';

interface TranscriptEntry {
  id: string;
  speaker: 'patient' | 'agent';
  text: string;
  timestamp: Date;
}

interface LiveTranscriptFeedProps {
  sessionId: string;
  onTriageUpdate?: (level: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function LiveTranscriptFeed({ sessionId, onTriageUpdate }: LiveTranscriptFeedProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addEntry = useCallback((speaker: 'patient' | 'agent', text: string) => {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), speaker, text, timestamp: new Date() },
    ]);
  }, []);

  // Azure Web PubSub connection for live transcript + agent response events
  useEffect(() => {
    if (sessionId.startsWith('demo-voice-')) return; // handled by demo effect below
    let cancelled = false;
    // Track whether this component owns the global connection lifecycle.
    // If VoiceSessionController already started the client, we only add handlers.
    const ownsConnection = !hasGlobalVoiceClient();

    async function connect() {
      try {
        const client = await createGlobalVoiceClient(API_BASE, sessionId);

        client.onMessage((msg) => {
          if (cancelled) return;

          if (msg.type === 'TranscriptReceived') {
            const m = msg as TranscriptReceivedMessage;
            addEntry('patient', m.text);
          } else if (msg.type === 'AgentResponse') {
            const m = msg as AgentResponseMessage;
            addEntry('agent', m.text);
            if (m.triageLevel && onTriageUpdate) onTriageUpdate(m.triageLevel);
          } else if (msg.type === 'TranscriptionStarted') {
            addEntry('agent', 'Transcription started. Listening...');
          }
        });

        client.onConnected(() => { if (!cancelled) setConnected(true); });
        client.onDisconnected(() => { if (!cancelled) setConnected(false); });

        if (ownsConnection) {
          // Only start + join when this component owns the connection
          await client.start();
          await client.joinSession(sessionId);
        }

        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      // Only dispose if this component created the connection
      if (ownsConnection) void disposeGlobalVoiceClient();
    };
  }, [sessionId, addEntry, onTriageUpdate]);

  useEffect(() => {
    const off = onAgentDecision((e) => {
      if (e.detail?.triageLevel && onTriageUpdate) {
        onTriageUpdate(e.detail.triageLevel);
      }
    });
    return off;
  }, [onTriageUpdate]);

  // Demo mode: progressively inject a realistic patient–agent conversation
  useEffect(() => {
    if (!sessionId.startsWith('demo-voice-')) return;
    setConnected(true);
    const DEMO_SCRIPT: Array<{ speaker: 'patient' | 'agent'; text: string; delay: number }> = [
      { speaker: 'agent',   text: 'Voice session started. AI is listening and transcribing in real time...', delay: 700 },
      { speaker: 'patient', text: 'I have been having severe chest pain for the last 30 minutes. It radiates to my left arm.', delay: 2500 },
      { speaker: 'agent',   text: 'Understood. Please rate the pain intensity on a scale of 1 to 10.', delay: 4400 },
      { speaker: 'patient', text: 'About an 8 out of 10. I also feel short of breath and I am sweating a lot.', delay: 6400 },
      { speaker: 'agent',   text: 'Shortness of breath and diaphoresis noted. Are you experiencing any nausea or dizziness?', delay: 8300 },
      { speaker: 'patient', text: 'Yes, I feel nauseous. No dizziness.', delay: 10000 },
      { speaker: 'agent',   text: 'Transcript captured. Submitting to AI triage engine for priority classification...', delay: 11600 },
    ];
    const timers = DEMO_SCRIPT.map(({ speaker, text, delay }) =>
      setTimeout(() => addEntry(speaker, text), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [sessionId, addEntry]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  return (
    <Card>
      <CardContent>
        <Box ref={scrollRef} role="log" aria-live="polite" aria-label="Live transcript" sx={{ height: 256, overflowY: 'auto' }}>
          {entries.length === 0 && (
            <Typography variant="body2" color="text.disabled" textAlign="center" sx={{ py: 8 }}>
              {connected ? `Connected. Waiting for transcript... Session: ${sessionId}` : `Connecting to voice hub... Session: ${sessionId}`}
            </Typography>
          )}
          {entries.map((entry) => (
            <Box
              key={entry.id}
              sx={{
                display: 'flex',
                justifyContent: entry.speaker === 'agent' ? 'flex-end' : 'flex-start',
                mb: 1,
              }}
            >
              <Box
                sx={{
                  maxWidth: '80%',
                  borderRadius: 2,
                  px: 1.5,
                  py: 1,
                  bgcolor: entry.speaker === 'agent' ? 'primary.main' : 'grey.100',
                  color: entry.speaker === 'agent' ? 'primary.contrastText' : 'text.primary',
                }}
              >
                <Typography variant="caption" fontWeight="medium" display="block">
                  {entry.speaker === 'agent' ? 'AI Agent' : 'Patient'}
                </Typography>
                <Typography variant="body2">{entry.text}</Typography>
                <Typography variant="caption" color={entry.speaker === 'agent' ? 'primary.light' : 'text.secondary'} display="block">
                  {entry.timestamp.toLocaleTimeString()}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
