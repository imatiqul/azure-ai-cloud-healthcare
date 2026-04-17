import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { CopilotChat } from './components/CopilotChat';
import Dashboard from './pages/Dashboard';

const VoicePage = lazy(() => import('voice/VoiceSessionController').then(m => ({ default: m.VoiceSessionController })));
const TriagePage = lazy(() => import('triage/TriageViewer').then(m => ({ default: m.TriageViewer })));
const SchedulingPage = lazy(() => import('scheduling/SlotCalendar').then(m => ({ default: m.SlotCalendar })));
const PopHealthPage = lazy(() => import('pophealth/RiskPanel').then(m => ({ default: m.RiskPanel })));
const RevenuePage = lazy(() => import('revenue/CodingQueue').then(m => ({ default: m.CodingQueue })));

function Loading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
      <CircularProgress />
    </Box>
  );
}

interface ErrorBoundaryProps { children: ReactNode; name: string }
interface ErrorBoundaryState { hasError: boolean; error?: Error }

class MfeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] MFE load error:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="error" gutterBottom>
            Failed to load {this.props.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {this.state.error?.message || 'The micro-frontend could not be loaded.'}
          </Typography>
          <Button variant="outlined" onClick={() => this.setState({ hasError: false })}>
            Retry
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopNav />
        <Box component="main" sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: 'background.default' }}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/voice" element={<MfeErrorBoundary name="Voice"><VoicePage /></MfeErrorBoundary>} />
              <Route path="/triage" element={<MfeErrorBoundary name="Triage"><TriagePage /></MfeErrorBoundary>} />
              <Route path="/scheduling" element={<MfeErrorBoundary name="Scheduling"><SchedulingPage /></MfeErrorBoundary>} />
              <Route path="/population-health" element={<MfeErrorBoundary name="Population Health"><PopHealthPage /></MfeErrorBoundary>} />
              <Route path="/revenue" element={<MfeErrorBoundary name="Revenue"><RevenuePage /></MfeErrorBoundary>} />
            </Routes>
          </Suspense>
        </Box>
      </Box>
      <CopilotChat />
    </Box>
  );
}
