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

const API_BASE  = import.meta.env.VITE_API_BASE_URL || '';
const AGENT_API = `${API_BASE}/api/v1/agents/guide`;

// ── Demo mode: shown when AI backend is offline ───────────────────────────────

const DEMO_SUGGESTIONS: Suggestion[] = [
  { id: 'ds-1', text: 'Show triage queue status',                description: 'Current AI triage priorities' },
  { id: 'ds-2', text: 'Summarise patient PAT-00142',             description: 'Alice Morgan — Diabetes/HTN' },
  { id: 'ds-3', text: 'Which patients are high readmission risk?', description: 'ML risk scores' },
  { id: 'ds-4', text: 'HEDIS quality measure compliance',        description: 'Population health metrics' },
];

const COPILOT_DEMO_RESPONSES: Array<{ pattern: RegExp; response: string }> = [
  {
    pattern: /triage|p1|p2|priority|urgent|immediate/i,
    response: `Current triage queue (demo):\n\n🔴 **P1 Immediate** — 2 cases\n  • demo-wf-1: Chest pain + left arm radiation, BP 160/100, HR 112 — suspected MI\n  • demo-wf-4: Sudden right-sided weakness + slurred speech — stroke protocol active\n\n🟡 **P2 Urgent** — 2 cases (fever/meningitis, acute abdomen)\n🟢 **P3 Standard** — 1 completed\n\nAI agent confidence: 94.2% · Guard verdict: PASS\n\nOpen the Triage panel to begin human review of P1 cases.`,
  },
  {
    pattern: /pat-00142|alice|morgan|diabetes|hba1c/i,
    response: `**PAT-00142 — Alice Morgan, 58F**\n\nActive conditions: Type 2 Diabetes Mellitus, Hypertension\nLast HbA1c: 8.4% (above 8% target)\nMedications: Metformin 1000mg twice daily · Lisinopril 10mg daily\n\nML Readmission Risk: **72% — High** · 95% CI [61%–83%]\n\nRecommendation: Schedule follow-up within 14 days. HEDIS CDC gap detected — Comprehensive Diabetes Care measure. Navigate to Population Health → HEDIS for details.`,
  },
  {
    pattern: /pat-00278|james|chen|cardiac|heart|coronary|ecg|ekg|afib/i,
    response: `**PAT-00278 — James Chen, 64M**\n\nActive conditions: Coronary Artery Disease, Atrial Fibrillation\nMedications: Warfarin 5mg · Metoprolol 25mg · Atorvastatin 40mg\nLast admission: 18 days ago (cardiac catheterisation)\n\nML Readmission Risk: **81% — High** · 95% CI [71%–91%]\n\nRecommendation: Coordinate with cardiology. Confirm INR monitoring schedule. Flag for care management.`,
  },
  {
    pattern: /pat-00315|sarah|oncology|cancer|chemo|breast/i,
    response: `**PAT-00315 — Sarah O'Brien, 47F**\n\nActive conditions: Stage III Breast Cancer (active treatment)\nCurrent protocol: Chemotherapy — cycle 4 of 6\nNext appointment: 3 days\n\nML Readmission Risk: **68% — Moderate** · 95% CI [55%–81%]\n\nRecommendation: Monitor for neutropenia. Verify anti-emetic protocol compliance. Flag for oncology care coordination.`,
  },
  {
    pattern: /schedule|appointment|book|slot|availab/i,
    response: `Available slots today (demo):\n\n• **Dr. Sarah Chen** (Cardiology) — 2:30 PM, 4:00 PM\n• **Dr. Michael Torres** (Internal Medicine) — 10:00 AM, 1:15 PM\n• **Dr. Emily Watson** (Endocrinology) — 3:45 PM\n\nNavigate to Scheduling → Book Appointment to confirm a slot.`,
  },
  {
    pattern: /risk|readmission|ml|confidence|predict/i,
    response: `ML Readmission Risk Summary (demo population):\n\n🔴 **High (>70%):** PAT-00142 (72%), PAT-00278 (81%)\n🟡 **Moderate (50–70%):** PAT-00315 (68%)\n🟢 **Low (<50%):** 5 patients\n\nModel: ML.NET binary classifier · AUC: 0.91 · Bootstrap confidence intervals\n\nNavigate to AI Governance → ML Confidence for per-patient feature attribution.`,
  },
  {
    pattern: /hedis|quality|measure|population|preventive/i,
    response: `HEDIS Quality Measures — demo population:\n\n• **Comprehensive Diabetes Care (CDC):** 67% compliant — 2 gaps\n• **Controlling High Blood Pressure (CBP):** 80% compliant\n• **Breast Cancer Screening (BCS):** 91% compliant\n• **Colorectal Cancer Screening (COL):** 74% compliant\n\nNavigate to Population Health → HEDIS for patient-level gap detail and care plan generation.`,
  },
  {
    pattern: /medication|prescription|drug|dose/i,
    response: `Active prescriptions — demo population:\n\n• **Metformin 1000mg** — 3 patients (Diabetes)\n• **Lisinopril 10mg** — 2 patients (Hypertension)\n• **Warfarin 5mg** — 1 patient (AFib anticoagulation)\n• **Metoprolol 25mg** — 1 patient (Cardiac)\n• **Chemotherapy protocol** — 1 patient (Oncology)\n\nNo drug interaction alerts detected. All prescriptions within formulary guidelines.`,
  },
  {
    pattern: /help|what can|show me|guide|how|feature/i,
    response: `I'm **HealthQ Copilot** — your AI clinical assistant. Here's what I can do:\n\n🚨 **Triage status** — "Show triage queue status"\n🏥 **Patient insights** — "Summarise PAT-00142"\n📊 **Risk scores** — "Which patients are high readmission risk?"\n📋 **Quality measures** — "HEDIS compliance summary"\n📅 **Scheduling** — "Book appointment for Alice Morgan"\n💊 **Medications** — "What medications is PAT-00278 on?"\n\nWhat would you like to explore?`,
  },
];

function getDemoResponse(userText: string): string {
  for (const { pattern, response } of COPILOT_DEMO_RESPONSES) {
    if (pattern.test(userText)) return response;
  }
  return `HealthQ Copilot (demo mode) — running with local demo data while the AI backend initialises.\n\nI can answer questions about:\n• Patients PAT-00142, PAT-00278, PAT-00315\n• Current triage queue and AI decisions\n• ML readmission risk scores\n• HEDIS quality measures\n• Scheduling and medications\n\nTry: "Show triage queue status" or "Summarise PAT-00142"`;
}

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

  // Load suggestions on first open; fall back to demo suggestions when offline
  useEffect(() => {
    if (open && suggestions.length === 0) {
      fetch(`${AGENT_API}/suggestions`, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : [])
        .then(data => setSuggestions(data.length > 0 ? data : DEMO_SUGGESTIONS))
        .catch(() => setSuggestions(DEMO_SUGGESTIONS));
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

    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    // Use the dedicated SSE streaming endpoint (GET /chat/stream).
    // Falls back to POST /chat JSON path if fetch fails (e.g., CORS pre-flight mismatch).
    const sid = sessionId ?? crypto.randomUUID();
    const streamUrl = `${AGENT_API}/chat/stream?message=${encodeURIComponent(text)}&sessionId=${sid}`;

    try {
      const res = await fetch(streamUrl, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      if (!sessionId) setSessionId(sid);

      // ── SSE streaming path ─────────────────────────────────────────────
      const reader   = res.body.getReader();
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
            if (!data) continue;
            try {
              const parsed = JSON.parse(data) as {
                token?: string;
                done?: boolean;
                suggestedRoute?: string | null;
              };
              if (parsed.done) {
                finalRoute = parsed.suggestedRoute ?? null;
              } else if (parsed.token) {
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
    } catch {
      // Backend offline — stream a contextual demo response word-by-word
      const demoText = getDemoResponse(text);
      const tokens = demoText.match(/\S+\s*/g) ?? [];
      let acc = '';
      for (const token of tokens) {
        acc += token;
        const snapshot = acc;
        setMessages(prev => prev.map((m, idx) =>
          idx === prev.length - 1 ? { ...m, content: snapshot, streaming: true } : m
        ));
        await new Promise(r => setTimeout(r, 22));
      }
      setMessages(prev => prev.map((m, idx) =>
        idx === prev.length - 1 ? { ...m, streaming: false } : m
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

