import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@healthcare/design-system';
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';

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

const VOICE_HUB_URL = import.meta.env.VITE_VOICE_API_URL
  ? `${import.meta.env.VITE_VOICE_API_URL}/hubs/voice`
  : `${import.meta.env.VITE_API_BASE_URL || ''}/hubs/voice`;

export function LiveTranscriptFeed({ sessionId, onTriageUpdate }: LiveTranscriptFeedProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HubConnection | null>(null);

  const addEntry = useCallback((speaker: 'patient' | 'agent', text: string) => {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), speaker, text, timestamp: new Date() },
    ]);
  }, []);

  useEffect(() => {
    const connection = new HubConnectionBuilder()
      .withUrl(VOICE_HUB_URL)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();

    hubRef.current = connection;

    connection.on('TranscriptReceived', (data: { sessionId: string; text: string; timestamp: string }) => {
      addEntry('patient', data.text);
    });

    connection.on('AgentResponse', (data: { text: string; triageLevel?: string }) => {
      addEntry('agent', data.text);
      if (data.triageLevel && onTriageUpdate) {
        onTriageUpdate(data.triageLevel);
      }
    });

    connection.on('TranscriptionStarted', () => {
      addEntry('agent', 'Transcription started. Listening...');
    });

    connection
      .start()
      .then(() => {
        setConnected(true);
        return connection.invoke('JoinSession', sessionId);
      })
      .catch(() => setConnected(false));

    return () => {
      connection.stop();
      hubRef.current = null;
    };
  }, [sessionId, addEntry, onTriageUpdate]);

  useEffect(() => {
    const handleDecision = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.triageLevel && onTriageUpdate) {
        onTriageUpdate(detail.triageLevel);
      }
    };
    window.addEventListener('mfe:agent:decision', handleDecision);
    return () => window.removeEventListener('mfe:agent:decision', handleDecision);
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
