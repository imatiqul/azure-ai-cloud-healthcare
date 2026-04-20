import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { Sidebar, SidebarProvider } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { CopilotChat } from './components/CopilotChat';
import Dashboard from './pages/Dashboard';
import DemoLanding from './pages/DemoLanding';

const VoicePage = lazy(() => import('voice/VoiceSessionController').then(m => ({ default: m.VoiceSessionController })));
const TriagePage = lazy(() => import('triage/TriageViewer').then(m => ({ default: m.TriageViewer })));
const SchedulingPage = lazy(() => import('scheduling/SlotCalendar').then(m => ({ default: m.SlotCalendar })));
const BookingFormPage = lazy(() => import('scheduling/BookingForm').then(m => ({ default: m.BookingForm })));
const WaitlistPanelPage = lazy(() => import('scheduling/WaitlistPanel').then(m => ({ default: m.WaitlistPanel })));
const PopHealthPage = lazy(() => import('pophealth/RiskPanel').then(m => ({ default: m.RiskPanel })));
const CareGapListPage = lazy(() => import('pophealth/CareGapList').then(m => ({ default: m.CareGapList })));
const RiskTrajectoryPanelPage = lazy(() => import('pophealth/RiskTrajectoryPanel').then(m => ({ default: m.RiskTrajectoryPanel })));
const RevenuePage = lazy(() => import('revenue/CodingQueue').then(m => ({ default: m.CodingQueue })));
const PriorAuthTrackerPage = lazy(() => import('revenue/PriorAuthTracker').then(m => ({ default: m.PriorAuthTracker })));
const DenialManagerPage = lazy(() => import('revenue/DenialManager').then(m => ({ default: m.DenialManager })));
const EncountersPage = lazy(() => import('encounters/EncounterList').then(m => ({ default: m.EncounterList })));
const EngagementPage = lazy(() => import('engagement/PatientPortal').then(m => ({ default: m.PatientPortal })));
const DeliveryAnalyticsDashboardPage = lazy(() => import('engagement/DeliveryAnalyticsDashboard').then(m => ({ default: m.DeliveryAnalyticsDashboard })));
const LabDeltaFlagsPanelPage = lazy(() => import('encounters/LabDeltaFlagsPanel').then(m => ({ default: m.LabDeltaFlagsPanel })));
const DrugInteractionCheckerPage = lazy(() => import('encounters/DrugInteractionChecker').then(m => ({ default: m.DrugInteractionChecker })));
const FhirObservationViewerPage = lazy(() => import('encounters/FhirObservationViewer').then(m => ({ default: m.FhirObservationViewer })));
const ConsentManagementPanelPage = lazy(() => import('engagement/ConsentManagementPanel').then(m => ({ default: m.ConsentManagementPanel })));
const VoiceSessionHistoryPage = lazy(() => import('voice/VoiceSessionHistory').then(m => ({ default: m.VoiceSessionHistory })));
const SdohAssessmentPanelPage = lazy(() => import('pophealth/SdohAssessmentPanel').then(m => ({ default: m.SdohAssessmentPanel })));
const CostPredictionPanelPage = lazy(() => import('pophealth/CostPredictionPanel').then(m => ({ default: m.CostPredictionPanel })));
const PatientProfilePanelPage = lazy(() => import('engagement/PatientProfilePanel').then(m => ({ default: m.PatientProfilePanel })));
const PatientRegistrationPanelPage = lazy(() => import('engagement/PatientRegistrationPanel').then(m => ({ default: m.PatientRegistrationPanel })));
const OcrDocumentPanelPage = lazy(() => import('engagement/OcrDocumentPanel').then(m => ({ default: m.OcrDocumentPanel })));
const FhirEverythingViewerPage = lazy(() => import('encounters/FhirEverythingViewer').then(m => ({ default: m.FhirEverythingViewer })));
const ModelGovernanceDashboardPage = lazy(() => import('./pages/ModelGovernanceDashboard'));
const OtpVerificationPanelPage = lazy(() => import('engagement/OtpVerificationPanel').then(m => ({ default: m.OtpVerificationPanel })));
const HedisMeasuresPanelPage = lazy(() => import('pophealth/HedisMeasuresPanel').then(m => ({ default: m.HedisMeasuresPanel })));
const TenantAdminPanelPage = lazy(() => import('./pages/TenantAdminPanel'));
const ModelEvaluationPanelPage = lazy(() => import('./pages/ModelEvaluationPanel'));
const IdentityUserAdminPanelPage = lazy(() => import('./pages/IdentityUserAdminPanel')); // Phase 24
const AuditLogPanelPage = lazy(() => import('./pages/AuditLogPanel'));                   // Phase 24
const BreakGlassAccessPanelPage = lazy(() => import('./pages/BreakGlassAccessPanel'));   // Phase 24
const ModelRegisterPanelPage = lazy(() => import('./pages/ModelRegisterPanel'));          // Phase 24
const ClinicianFeedbackDashboardPage = lazy(() => import('./pages/ClinicianFeedbackDashboard')); // Phase 25
const ExperimentSummaryPanelPage = lazy(() => import('./pages/ExperimentSummaryPanel')); // Phase 25
const PushSubscriptionPanelPage = lazy(() => import('engagement/PushSubscriptionPanel').then(m => ({ default: m.PushSubscriptionPanel }))); // Phase 25
const GdprErasurePanelPage = lazy(() => import('engagement/GdprErasurePanel').then(m => ({ default: m.GdprErasurePanel }))); // Phase 25
const DemoLive = lazy(() => import('./pages/DemoLive'));

function Loading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={200} gap={1}>
      <CircularProgress size={24} />
      <Typography variant="body2" color="text.secondary">Loading...</Typography>
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
  const location = useLocation();
  const isDemoRoute = location.pathname.startsWith('/demo');

  // Demo routes render without shell chrome (no sidebar, topnav, or copilot)
  if (isDemoRoute) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/demo" element={<DemoLanding />} />
          <Route path="/demo/live" element={<DemoLive />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <SidebarProvider>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Sidebar />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopNav />
          <Box component="main" sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 }, bgcolor: 'background.default' }}>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/voice" element={
                  <MfeErrorBoundary name="Voice">
                    <VoicePage />
                    <VoiceSessionHistoryPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/triage" element={<MfeErrorBoundary name="Triage"><TriagePage /></MfeErrorBoundary>} />
                <Route path="/scheduling" element={
                  <MfeErrorBoundary name="Scheduling">
                    <SchedulingPage />
                    <BookingFormPage />
                    <WaitlistPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/population-health" element={
                  <MfeErrorBoundary name="Population Health">
                    <PopHealthPage />
                    <CareGapListPage />
                    <RiskTrajectoryPanelPage />
                    <SdohAssessmentPanelPage />
                    <CostPredictionPanelPage />
                    <HedisMeasuresPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/revenue" element={
                  <MfeErrorBoundary name="Revenue">
                    <RevenuePage />
                    <PriorAuthTrackerPage />
                    <DenialManagerPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/encounters" element={
                  <MfeErrorBoundary name="Encounters">
                    <EncountersPage />
                    <LabDeltaFlagsPanelPage />
                    <DrugInteractionCheckerPage />
                    <FhirObservationViewerPage />
                    <FhirEverythingViewerPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/patient-portal" element={
                  <MfeErrorBoundary name="Patient Portal">
                    <EngagementPage />
                    <DeliveryAnalyticsDashboardPage />
                    <ConsentManagementPanelPage />
                    <PatientProfilePanelPage />
                    <PatientRegistrationPanelPage />
                    <OcrDocumentPanelPage />
                    <OtpVerificationPanelPage />
                    <PushSubscriptionPanelPage />
                    <GdprErasurePanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/governance" element={
                  <MfeErrorBoundary name="Governance">
                    <ModelGovernanceDashboardPage />
                    <ModelEvaluationPanelPage />
                    <ModelRegisterPanelPage />
                    <ExperimentSummaryPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/tenants" element={
                  <MfeErrorBoundary name="Tenants">
                    <TenantAdminPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/users" element={
                  <MfeErrorBoundary name="User Admin">
                    <IdentityUserAdminPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/audit" element={
                  <MfeErrorBoundary name="Audit Log">
                    <AuditLogPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/break-glass" element={
                  <MfeErrorBoundary name="Break-Glass">
                    <BreakGlassAccessPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/feedback" element={
                  <MfeErrorBoundary name="AI Feedback">
                    <ClinicianFeedbackDashboardPage />
                  </MfeErrorBoundary>
                } />
              </Routes>
            </Suspense>
          </Box>
        </Box>
        <CopilotChat />
      </Box>
    </SidebarProvider>
  );
}
