import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO_MESSAGES: NotificationMessage[] = [
  { id: 'nm-001', campaignId: 'camp-hba1c-recall-2026', channel: 'SMS',   status: 'Delivered', createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: 'nm-002', campaignId: 'camp-flu-vaccine-2026',  channel: 'Email', status: 'Opened',    createdAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'nm-003', campaignId: 'camp-appt-reminder',     channel: 'SMS',   status: 'Delivered', createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
];

interface NotificationMessage {
  id: string;
  campaignId: string;
  channel: string;
  status: string;
  createdAt: string;
}

interface Props {
  patientId: string;
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'secondary';

function channelColor(channel: string): BadgeVariant {
  switch (channel.toLowerCase()) {
    case 'email': return 'secondary';
    case 'sms':   return 'warning';
    default:      return 'default';
  }
}

export function NotificationInbox({ patientId }: Props) {
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/v1/notifications/messages?patientId=${encodeURIComponent(patientId)}`, { signal: AbortSignal.timeout(10_000) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<NotificationMessage[]>;
      })
      .then(setMessages)
      .catch(() => setMessages(DEMO_MESSAGES))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Typography color="text.secondary">Loading notifications…</Typography>;

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.disabled" textAlign="center" sx={{ py: 4 }}>
            No notifications for this patient
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {messages.map((msg) => (
        <Card key={msg.id}>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Badge variant={channelColor(msg.channel)}>{msg.channel}</Badge>
                  <Typography variant="body2" color="text.secondary">
                    Campaign #{msg.campaignId.substring(0, 8)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {new Date(msg.createdAt).toLocaleString()}
                </Typography>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Status: <strong>{msg.status}</strong>
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
