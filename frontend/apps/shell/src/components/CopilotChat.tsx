import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useTranslation } from 'react-i18next';

const HISTORY_KEY = 'healthq_chat_history';
const MAX_HISTORY  = 50; // keep last 50 messages in localStorage

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedRoute?: string | null;
  streaming?: boolean;
}

interface Suggestion {
  id: string;
  text: string;
  description: string;
}

interface GuideResponse {
  sessionId: string;
  message: string;
  suggestedRoute: string | null;
}

const API_BASE  = import.meta.env.VITE_API_BASE_URL || '';
const AGENT_API = `${API_BASE}/api/v1/agents/guide`;

function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    const trimmed = messages.slice(-MAX_HISTORY).map(m => ({ ...m, streaming: false }));
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded — ignore */ }
}

export function CopilotChat() {
  const { t } = useTranslation();
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<ChatMessage[]>(loadHistory);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Persist history to sessionStorage whenever it changes
  useEffect(() => { saveHistory(messages); }, [messages]);

  // Load suggestions on first open
  useEffect(() => {
    if (open && suggestions.length === 0) {
      fetch(`${AGENT_API}/suggestions`)
        .then(r => r.ok ? r.json() : [])
        .then(setSuggestions)
        .catch(() => {});
    }
  }, [open, suggestions.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Optimistic streaming placeholder
    const streamingIdx = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    // Try SSE streaming first; fall back to JSON if server returns non-event-stream
    try {
      const res = await fetch(`${AGENT_API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('Content-Type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // ── SSE streaming path ─────────────────────────────────────────
        const reader   = res.body!.getReader();
        const decoder  = new TextDecoder();
        let accumulated = '';
        let finalRoute: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              try {
                const parsed: { token?: string; suggestedRoute?: string | null; sessionId?: string } = JSON.parse(data);
                if (parsed.sessionId && !sessionId) setSessionId(parsed.sessionId);
                if (parsed.suggestedRoute !== undefined) finalRoute = parsed.suggestedRoute;
                if (parsed.token) {
                  accumulated += parsed.token;
                  setMessages(prev => prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: accumulated, streaming: true } : m
                  ));
                }
              } catch { /* ignore malformed SSE line */ }
            }
          }
        }

        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, streaming: false, suggestedRoute: finalRoute } : m
        ));
      } else {
        // ── JSON fallback path ─────────────────────────────────────────
        const data: GuideResponse = await res.json();
        if (!sessionId && data.sessionId) setSessionId(data.sessionId);
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1
            ? { role: 'assistant', content: data.message, suggestedRoute: data.suggestedRoute, streaming: false }
            : m
        ));
      }
    } catch {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1
          ? { role: 'assistant', content: t('copilot.error'), streaming: false }
          : m
      ));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sessionId, messages.length, t]);

  const handleNavigate = (route: string) => {
    navigate(route);
    setOpen(false);
  };

  const clearHistory = () => {
    setMessages([]);
    sessionStorage.removeItem(HISTORY_KEY);
  };

  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <Fab
          color="primary"
          aria-label="Open HealthQ Copilot"
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            width: 64,
            height: 64,
            boxShadow: 4,
          }}
        >
          <SmartToyIcon sx={{ fontSize: 32 }} />
        </Fab>
      )}

      {/* Chat Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 420 }, display: 'flex', flexDirection: 'column' },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
          <SmartToyIcon />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">{t('copilot.title')}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>{t('copilot.subtitle')}</Typography>
          </Box>
          {messages.length > 0 && (
            <Tooltip title="Clear history">
              <IconButton size="small" onClick={clearHistory} sx={{ color: 'inherit' }} aria-label="Clear chat history">
                <DeleteSweepIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'inherit' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Messages */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <SmartToyIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('copilot.greeting')}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t('copilot.tryOne')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                {suggestions.map(s => (
                  <Chip
                    key={s.id}
                    label={s.text}
                    size="small"
                    variant="outlined"
                    onClick={() => sendMessage(s.text)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                  color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  position: 'relative',
                }}
              >
                {msg.content}
                {msg.streaming && (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      width: 8,
                      height: 14,
                      ml: 0.5,
                      bgcolor: 'primary.light',
                      borderRadius: 0.5,
                      animation: 'blink 1s step-end infinite',
                      '@keyframes blink': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0 },
                      },
                    }}
                  />
                )}
              </Box>
              {msg.suggestedRoute && !msg.streaming && (
                <Chip
                  label={`${t('copilot.navigateTo')} ${msg.suggestedRoute}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={() => handleNavigate(msg.suggestedRoute!)}
                  sx={{ mt: 0.5, cursor: 'pointer' }}
                />
              )}
            </Box>
          ))}

          {loading && !messages.some(m => m.streaming) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, alignSelf: 'flex-start' }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Thinking...</Typography>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Suggestions bar when there are messages */}
        {messages.length > 0 && (
          <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {suggestions.slice(0, 4).map(s => (
              <Chip
                key={s.id}
                label={s.text}
                size="small"
                variant="outlined"
                onClick={() => sendMessage(s.text)}
                sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
              />
            ))}
          </Box>
        )}

        {/* Input */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('copilot.placeholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={loading}
            autoComplete="off"
          />
          <IconButton
            color="primary"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            aria-label={t('copilot.send')}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Drawer>
    </>
  );
}

