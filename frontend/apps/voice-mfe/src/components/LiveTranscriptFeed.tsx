import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@healthcare/design-system';
import {
  createGlobalVoiceClient,
  disposeGlobalVoiceClient,
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
    let cancelled = false;

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

        await client.start();
        await client.joinSession(sessionId);
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      void disposeGlobalVoiceClient();
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  return (
    <Card>
      <CardContent>
        <Box ref={scrollRef} sx={{ height: 256, overflowY: 'auto' }}>
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
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
