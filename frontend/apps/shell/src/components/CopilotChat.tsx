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
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedRoute?: string | null;
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

const AGENT_API = '/api/v1/agents/guide';

export function CopilotChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

    try {
      const res = await fetch(`${AGENT_API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) throw new Error('Failed to get response');

      const data: GuideResponse = await res.json();
      if (!sessionId) setSessionId(data.sessionId);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message,
        suggestedRoute: data.suggestedRoute,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not reach the platform guide service. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const handleNavigate = (route: string) => {
    navigate(route);
    setOpen(false);
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
            <Typography variant="subtitle1" fontWeight="bold">HealthQ Copilot</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>AI Clinical Workflow Guide</Typography>
          </Box>
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
                Hi! I'm your HealthQ Copilot. I can guide you through the entire clinical workflow.
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Try one of these:
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
                }}
              >
                {msg.content}
              </Box>
              {msg.suggestedRoute && (
                <Chip
                  label={`Navigate to ${msg.suggestedRoute}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={() => handleNavigate(msg.suggestedRoute!)}
                  sx={{ mt: 0.5, cursor: 'pointer' }}
                />
              )}
            </Box>
          ))}

          {loading && (
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
            placeholder="Ask about the clinical workflow..."
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
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Drawer>
    </>
  );
}
