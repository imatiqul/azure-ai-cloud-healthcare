import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import { LiveTranscriptFeed } from './LiveTranscriptFeed';

type SessionStatus = 'idle' | 'connecting' | 'live' | 'ended';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function VoiceSessionController() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [triage, setTriage] = useState<string | null>(null);

  async function startSession() {
    setStatus('connecting');
    try {
      const res = await fetch(`${API_BASE}/api/v1/voice/sessions`, {
        method: 'POST',
        body: JSON.stringify({ patientId: '00000000-0000-0000-0000-000000000000' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setSessionId(data.id);
      setStatus('live');
    } catch {
      setStatus('idle');
    }
  }

  async function endSession() {
    if (!sessionId) return;
    await fetch(`${API_BASE}/api/v1/voice/sessions/${sessionId}/end`, { method: 'POST' });
    setStatus('ended');
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
          </Stack>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <Button onClick={startSession} disabled={status !== 'idle'}>
              Start Session
            </Button>
            <Button onClick={endSession} variant="destructive" disabled={status !== 'live'}>
              End Session
            </Button>
          </Stack>
          {status === 'live' && sessionId && (
            <LiveTranscriptFeed sessionId={sessionId} onTriageUpdate={setTriage} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
