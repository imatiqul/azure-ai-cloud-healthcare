import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { SkeletonStatGrid } from '@healthcare/design-system';
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
const XaiExplanationPanelPage = lazy(() => import('./pages/XaiExplanationPanel')); // Phase 26
const GuideHistoryPanelPage = lazy(() => import('./pages/GuideHistoryPanel')); // Phase 26
const DemoAdminPanelPage = lazy(() => import('./pages/DemoAdminPanel')); // Phase 26
const ClinicalCoderPanelPage = lazy(() => import('triage/ClinicalCoderPanel').then(m => ({ default: m.ClinicalCoderPanel }))); // Phase 26
const MlConfidencePanelPage = lazy(() => import('./pages/MlConfidencePanel')); // Phase 27
const CampaignManagerPanelPage = lazy(() => import('engagement/CampaignManagerPanel').then(m => ({ default: m.CampaignManagerPanel }))); // Phase 27
const DemoLive = lazy(() => import('./pages/DemoLive'));
const MedicationPanelPage = lazy(() => import('encounters/MedicationPanel').then(m => ({ default: m.MedicationPanel }))); // Phase 30
const AllergyPanelPage = lazy(() => import('encounters/AllergyPanel').then(m => ({ default: m.AllergyPanel }))); // Phase 30
const ProblemListPanelPage = lazy(() => import('encounters/ProblemListPanel').then(m => ({ default: m.ProblemListPanel }))); // Phase 30
const ImmunizationPanelPage = lazy(() => import('encounters/ImmunizationPanel').then(m => ({ default: m.ImmunizationPanel }))); // Phase 30
const PractitionerManagerPage = lazy(() => import('./pages/PractitionerManager')); // Phase 30

function Loading() {
  return (
    <Box sx={{ p: 3 }}>
      <SkeletonStatGrid count={8} />
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
        <Box
          sx={{
            p: 4,
            m: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'error.light',
            bgcolor: 'background.paper',
            textAlign: 'center',
            maxWidth: 480,
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main', opacity: 0.8 }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={700} color="error.main" gutterBottom>
              Unable to load {this.props.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {this.state.error?.message || 'The micro-frontend could not be loaded. Check your network connection and try again.'}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
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
                <Route path="/triage" element={
                  <MfeErrorBoundary name="Triage">
                    <TriagePage />
                    <ClinicalCoderPanelPage />
                  </MfeErrorBoundary>
                } />
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
                    <MedicationPanelPage />
                    <AllergyPanelPage />
                    <ProblemListPanelPage />
                    <ImmunizationPanelPage />
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
                    <CampaignManagerPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/governance" element={
                  <MfeErrorBoundary name="Governance">
                    <ModelGovernanceDashboardPage />
                    <ModelEvaluationPanelPage />
                    <ModelRegisterPanelPage />
                    <ExperimentSummaryPanelPage />
                    <XaiExplanationPanelPage />
                    <MlConfidencePanelPage />
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
                <Route path="/admin/guide-history" element={
                  <MfeErrorBoundary name="Guide History">
                    <GuideHistoryPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/demo" element={
                  <MfeErrorBoundary name="Demo Admin">
                    <DemoAdminPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/practitioners" element={
                  <MfeErrorBoundary name="Practitioners">
                    <PractitionerManagerPage />
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
