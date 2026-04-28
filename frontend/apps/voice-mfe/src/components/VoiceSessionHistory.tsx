import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Card, CardHeader, CardTitle, CardContent } from '@healthcare/design-system';
import { gqlFetch } from '@healthcare/graphql-client';

const GET_VOICE_SESSIONS = /* GraphQL */ `
  query GetVoiceSessions {
    voiceSessions {
      id
      patientId
      status
      transcriptText
      createdAt
      endedAt
    }
  }
`;

const DEMO_SESSIONS: VoiceSessionSummary[] = [
  {
    id: 'vs-1', patientId: 'PAT-00142', patientName: 'Alice Morgan',
    status: 'Ended',
    startedAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    endedAt:   new Date(Date.now() - 41 * 60_000).toISOString(),
    transcriptSnippet: 'Patient: "My blood sugar was 280 this morning and I have a bad headache." — Clinician: "Are you taking your Metformin as prescribed?"',
    aiNote: 'Glycaemic control gap identified. HbA1c review recommended. HEDIS Comprehensive Diabetes Care gap flagged.',
  },
  {
    id: 'vs-2', patientId: 'PAT-00278', patientName: 'James Chen',
    status: 'Ended',
    startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    endedAt:   new Date(Date.now() - 108 * 60_000).toISOString(),
    transcriptSnippet: 'Patient: "I had palpitations and mild chest discomfort since yesterday." — Clinician: "Any shortness of breath or arm pain?"',
    aiNote: 'Cardiac event workup initiated. INR monitoring gap — Warfarin dosing review required. Cardiology referral placed.',
  },
  {
    id: 'vs-3', patientId: 'PAT-00315', patientName: "Sarah O'Brien",
    status: 'Ended',
    startedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    endedAt:   new Date(Date.now() - 162 * 60_000).toISOString(),
    transcriptSnippet: 'Patient: "The nausea is better this cycle but the fatigue is really affecting me." — Clinician: "Let\'s check your CBC and electrolytes."',
    aiNote: 'Chemo cycle 4 of 6. CBC ordered. Anti-emetic protocol updated. Fatigue management plan initiated.',
  },
  {
    id: 'vs-4', patientId: 'PAT-00391', patientName: 'Robert Singh',
    status: 'Ended',
    startedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    endedAt:   new Date(Date.now() - 282 * 60_000).toISOString(),
    transcriptSnippet: 'Patient: "The knee pain is much worse on stairs and after sitting for long periods." — Clinician: "How long has this been going on?"',
    aiNote: 'Orthopedic referral recommended. NSAID prescription reviewed for renal function. Physiotherapy plan ordered.',
  },
];

type SessionStatus = 'Live' | 'Ended' | 'Connecting';

interface VoiceSessionDto {
  id:             string;
  patientId:      string;
  status:         string;
  transcriptText: string | null;
  createdAt:      string;
  endedAt?:       string | null;
}

interface VoiceSessionSummary {
  id:                  string;
  patientId:           string;
  patientName?:        string;
  status:              SessionStatus;
  startedAt:           string;
  endedAt?:            string;
  transcriptSnippet?:  string;
  aiNote?:             string;
}

function statusColor(s: SessionStatus): 'success' | 'warning' | 'default' {
  if (s === 'Live') return 'success';
  if (s === 'Connecting') return 'warning';
  return 'default';
}

function formatDuration(startedAt: string, endedAt?: string): string {
  const start  = new Date(startedAt);
  const end    = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const mins   = Math.floor(diffMs / 60000);
  const secs   = Math.floor((diffMs % 60000) / 1000);
  if (mins > 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function VoiceSessionHistory() {
  const [sessions, setSessions] = useState<VoiceSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSessions() {
    setLoading(true);
    setError(null);
    try {
      const data = await gqlFetch<{ voiceSessions: VoiceSessionDto[] }>({ query: GET_VOICE_SESSIONS });
      const mapped: VoiceSessionSummary[] = (data.voiceSessions ?? []).map(s => ({
        id:                 s.id,
        patientId:          s.patientId,
        status:             (s.status as VoiceSessionSummary['status']) ?? 'Ended',
        startedAt:          s.createdAt,
        endedAt:            s.endedAt,
        transcriptSnippet:  s.transcriptText?.slice(0, 200) ?? undefined,
      }));
      setSessions(mapped.length > 0 ? mapped : DEMO_SESSIONS);
    } catch {
      setError('Failed to load sessions — showing demo data');
      setSessions(DEMO_SESSIONS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSessions();
  }, []);

  const liveSessions = sessions.filter((s) => s.status === 'Live');
  const endedSessions = sessions.filter((s) => s.status !== 'Live');

  return (
    <Card>
      <CardHeader>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <CardTitle>Voice Session History</CardTitle>
          <IconButton size="small" onClick={fetchSessions} disabled={loading} aria-label="refresh sessions">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </CardHeader>
      <CardContent>
        {loading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading sessions…
            </Typography>
          </Stack>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && sessions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No voice sessions found.
          </Typography>
        )}

        {/* Live sessions banner */}
        {liveSessions.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Chip
              label={`${liveSessions.length} live`}
              color="success"
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              session{liveSessions.length > 1 ? 's' : ''} in progress
            </Typography>
          </Stack>
        )}

        {/* Session list */}
        <Stack spacing={1.5}>
          {sessions.map((session, idx) => (
            <Stack key={session.id}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Stack spacing={0.5} sx={{ flex: 1 }}>
                  {/* Patient + status */}
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {session.patientName ? (
                      <Typography variant="body2" fontWeight={700}>
                        {session.patientName}
                      </Typography>
                    ) : null}
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {session.patientId}
                    </Typography>
                    <Chip
                      label={session.status}
                      color={statusColor(session.status)}
                      size="small"
                    />
                  </Stack>

                  {/* Timestamps + duration */}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(session.startedAt).toLocaleString()}
                    {' · '}
                    <span style={{ fontWeight: 600 }}>
                      {formatDuration(session.startedAt, session.endedAt)}
                    </span>
                  </Typography>

                  {/* Transcript snippet */}
                  {session.transcriptSnippet && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {session.transcriptSnippet}
                    </Typography>
                  )}

                  {/* AI clinical note */}
                  {session.aiNote && (
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 500 }}>
                      AI: {session.aiNote}
                    </Typography>
                  )}
                </Stack>

                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {session.id.slice(0, 8)}…
                </Typography>
              </Stack>

              {idx < sessions.length - 1 && <Divider sx={{ mt: 1.5 }} />}
            </Stack>
          ))}
        </Stack>

        {/* Summary footer */}
        {sessions.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Chip label={`${sessions.length} total`} size="small" variant="outlined" />
            <Chip label={`${endedSessions.length} ended`} size="small" variant="outlined" />
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
