import { lazy, Suspense, Component, useEffect, useRef, type ComponentType, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { SkeletonStatGrid } from '@healthcare/design-system';
import { Sidebar, SidebarProvider } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { CopilotChat } from './components/CopilotChat';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { ToastProvider } from './components/ToastProvider';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { AppBreadcrumbs } from './components/AppBreadcrumbs'; // Phase 34
import { SessionExpiryGuard } from './components/SessionExpiryGuard'; // Phase 34
import { PageTracker } from './components/PageTracker'; // Phase 35
import { QuickActionsSpeedDial } from './components/QuickActionsSpeedDial'; // Phase 35
import { AnnouncementBanner } from './components/AnnouncementBanner'; // Phase 36
import { PatientContextBar } from './components/PatientContextBar';   // Phase 49
import { OfflineIndicator } from './components/OfflineIndicator'; // Phase 37
import { AutoDemoPlayer } from './components/AutoDemo/AutoDemoPlayer'; // Phase 58
import { useGlobalStore } from './store'; // Phase 58
import { OnboardingWizard } from './components/OnboardingWizard'; // Phase 38
import { TabbedPageLayout } from './components/TabbedPageLayout'; // Phase 48
const NotFoundPage = lazy(() => import('./pages/NotFoundPage')); // Phase 38
import Dashboard from './pages/Dashboard';
import DemoLanding from './pages/DemoLanding';
const AdminSettingsPage = lazy(() => import('./pages/AdminSettings')); // Phase 33
const UserProfilePage   = lazy(() => import('./pages/UserProfile'));   // Phase 33
const NotificationCenterPage = lazy(() => import('./pages/NotificationCenter')); // Phase 34
const UserPreferencesPanelPage = lazy(() => import('./pages/UserPreferencesPanel')); // Phase 36

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
const EngagementPage = lazy(() => import('engagement/PatientPortal').then(m => ({ default: m.PatientPortal })).catch((): { default: ComponentType } => ({ default: () => null })));
const DeliveryAnalyticsDashboardPage = lazy(() => import('engagement/DeliveryAnalyticsDashboard').then(m => ({ default: m.DeliveryAnalyticsDashboard })).catch((): { default: ComponentType } => ({ default: () => null })));
const LabDeltaFlagsPanelPage = lazy(() => import('encounters/LabDeltaFlagsPanel').then(m => ({ default: m.LabDeltaFlagsPanel })));
const DrugInteractionCheckerPage = lazy(() => import('encounters/DrugInteractionChecker').then(m => ({ default: m.DrugInteractionChecker })));
const FhirObservationViewerPage = lazy(() => import('encounters/FhirObservationViewer').then(m => ({ default: m.FhirObservationViewer })));
const ConsentManagementPanelPage = lazy(() => import('engagement/ConsentManagementPanel').then(m => ({ default: m.ConsentManagementPanel })).catch((): { default: ComponentType } => ({ default: () => null })));
const VoiceSessionHistoryPage = lazy(() => import('voice/VoiceSessionHistory').then(m => ({ default: m.VoiceSessionHistory })));
const SdohAssessmentPanelPage = lazy(() => import('pophealth/SdohAssessmentPanel').then(m => ({ default: m.SdohAssessmentPanel })));
const CostPredictionPanelPage = lazy(() => import('pophealth/CostPredictionPanel').then(m => ({ default: m.CostPredictionPanel })));
const PatientProfilePanelPage = lazy(() => import('engagement/PatientProfilePanel').then(m => ({ default: m.PatientProfilePanel })).catch((): { default: ComponentType } => ({ default: () => null })));
const PatientRegistrationPanelPage = lazy(() => import('engagement/PatientRegistrationPanel').then(m => ({ default: m.PatientRegistrationPanel })).catch((): { default: ComponentType } => ({ default: () => null })));
const OcrDocumentPanelPage = lazy(() => import('engagement/OcrDocumentPanel').then(m => ({ default: m.OcrDocumentPanel })).catch((): { default: ComponentType } => ({ default: () => null })));
const FhirEverythingViewerPage = lazy(() => import('encounters/FhirEverythingViewer').then(m => ({ default: m.FhirEverythingViewer })));
const ModelGovernanceDashboardPage = lazy(() => import('./pages/ModelGovernanceDashboard'));
const OtpVerificationPanelPage = lazy(() => import('engagement/OtpVerificationPanel').then(m => ({ default: m.OtpVerificationPanel })).catch((): { default: ComponentType } => ({ default: () => null })));
const HedisMeasuresPanelPage = lazy(() => import('pophealth/HedisMeasuresPanel').then(m => ({ default: m.HedisMeasuresPanel })));
const TenantAdminPanelPage = lazy(() => import('./pages/TenantAdminPanel'));
const ModelEvaluationPanelPage = lazy(() => import('./pages/ModelEvaluationPanel'));
const IdentityUserAdminPanelPage = lazy(() => import('./pages/IdentityUserAdminPanel')); // Phase 24
const AuditLogPanelPage = lazy(() => import('./pages/AuditLogPanel'));                   // Phase 24
const BreakGlassAccessPanelPage = lazy(() => import('./pages/BreakGlassAccessPanel'));   // Phase 24
const ModelRegisterPanelPage = lazy(() => import('./pages/ModelRegisterPanel'));          // Phase 24
const ClinicianFeedbackDashboardPage = lazy(() => import('./pages/ClinicianFeedbackDashboard')); // Phase 25
const ExperimentSummaryPanelPage = lazy(() => import('./pages/ExperimentSummaryPanel')); // Phase 25
const PushSubscriptionPanelPage = lazy(() => import('engagement/PushSubscriptionPanel').then(m => ({ default: m.PushSubscriptionPanel })).catch((): { default: ComponentType } => ({ default: () => null }))); // Phase 25
const GdprErasurePanelPage = lazy(() => import('engagement/GdprErasurePanel').then(m => ({ default: m.GdprErasurePanel })).catch((): { default: ComponentType } => ({ default: () => null }))); // Phase 25
const XaiExplanationPanelPage = lazy(() => import('./pages/XaiExplanationPanel')); // Phase 26
const GuideHistoryPanelPage = lazy(() => import('./pages/GuideHistoryPanel')); // Phase 26
const DemoAdminPanelPage = lazy(() => import('./pages/DemoAdminPanel')); // Phase 26
const ClinicalCoderPanelPage = lazy(() => import('triage/ClinicalCoderPanel').then(m => ({ default: m.ClinicalCoderPanel }))); // Phase 26
const MlConfidencePanelPage = lazy(() => import('./pages/MlConfidencePanel')); // Phase 27
const CampaignManagerPanelPage = lazy(() => import('engagement/CampaignManagerPanel').then(m => ({ default: m.CampaignManagerPanel })).catch((): { default: ComponentType } => ({ default: () => null }))); // Phase 27
const DemoLive = lazy(() => import('./pages/DemoLive'));
const ClinicalAlertsCenterPage = lazy(() => import('./pages/ClinicalAlertsCenter')); // Phase 41
const ReportsExportPanelPage   = lazy(() => import('./pages/ReportsExportPanel'));   // Phase 41
const MedicationPanelPage = lazy(() => import('encounters/MedicationPanel').then(m => ({ default: m.MedicationPanel }))); // Phase 30
const AllergyPanelPage = lazy(() => import('encounters/AllergyPanel').then(m => ({ default: m.AllergyPanel }))); // Phase 30
const ProblemListPanelPage = lazy(() => import('encounters/ProblemListPanel').then(m => ({ default: m.ProblemListPanel }))); // Phase 30
const ImmunizationPanelPage = lazy(() => import('encounters/ImmunizationPanel').then(m => ({ default: m.ImmunizationPanel }))); // Phase 30
const PractitionerManagerPage = lazy(() => import('./pages/PractitionerManager')); // Phase 30
const BusinessKpiDashboardPage = lazy(() => import('./pages/BusinessKpiDashboard')); // Phase 31
const WorkflowOperationsWorkbenchPage = lazy(() => import('./pages/WorkflowOperationsWorkbench'));
const PlatformHealthPanelPage  = lazy(() => import('./pages/PlatformHealthPanel'));  // Phase 31

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
  const navigate = useNavigate();
  const isDemoRoute    = location.pathname.startsWith('/demo');
  const { isDemoActive } = useGlobalStore(); // Phase 58
  const { open: paletteOpen, openPalette, closePalette }         = useCommandPalette();
  const { open: shortcutsOpen, closeModal: closeShortcuts } = useKeyboardShortcutsModal();
  const gKeyRef = useRef(false); // Phase 56 — tracks first key of G+* sequences

  // Phase 56 — keep browser tab title in sync with unread notification count
  useEffect(() => {
    const NOTIF_KEY = 'hq:notification-history';
    function syncTitle() {
      try {
        const stored = JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]') as Array<{ read: boolean }>;
        const unread = stored.filter(r => !r.read).length;
        document.title = unread > 0 ? `(${unread}) HealthQ Copilot` : 'HealthQ Copilot';
      } catch {
        document.title = 'HealthQ Copilot';
      }
    }
    syncTitle();
    window.addEventListener('storage', syncTitle);
    window.addEventListener('hq:notifications-updated', syncTitle);
    return () => {
      window.removeEventListener('storage', syncTitle);
      window.removeEventListener('hq:notifications-updated', syncTitle);
    };
  }, []);

  // Phase 56 — G+* quick navigation shortcuts (G then D/T/S/P/R/E/V/N)
  useEffect(() => {
    const GO_MAP: Record<string, string> = {
      d: '/', t: '/triage', s: '/scheduling',
      p: '/population-health', r: '/revenue',
      e: '/encounters', v: '/voice', n: '/notifications',
    };
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'g' || e.key === 'G') {
        gKeyRef.current = true;
        clearTimeout(timer);
        timer = setTimeout(() => { gKeyRef.current = false; }, 1000);
        return;
      }
      if (gKeyRef.current) {
        const dest = GO_MAP[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); navigate(dest); }
        gKeyRef.current = false;
        clearTimeout(timer);
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); clearTimeout(timer); };
  }, [navigate]);

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
      {/* Phase 56 — skip-to-main-content link for keyboard/screen-reader users */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute', top: -9999, left: -9999,
          '&:focus': { top: 8, left: 8, zIndex: 9999, p: 1, px: 2, borderRadius: 1,
            bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 },
        }}
      >
        Skip to main content
      </Box>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Sidebar />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopNav onOpenSearch={openPalette} />
          <OfflineIndicator />
          <AppBreadcrumbs />
          <AnnouncementBanner />
          <PatientContextBar />
          <Box id="main-content" component="main" sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 }, bgcolor: 'background.default' }}>
            {/* PageTracker runs on every navigation — outside Routes so it captures all paths */}
            <PageTracker />
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/notifications" element={
                  <MfeErrorBoundary name="Notification Center">
                    <NotificationCenterPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/business" element={
                  <MfeErrorBoundary name="Business KPIs">
                    <BusinessKpiDashboardPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/workflow-ops" element={
                  <MfeErrorBoundary name="Workflow Operations Workbench">
                    <WorkflowOperationsWorkbenchPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/voice" element={
                  <MfeErrorBoundary name="Voice">
                    <TabbedPageLayout
                      title="Voice Sessions"
                      storageKey="hq:tab-voice"
                      tabs={[
                        { label: 'Voice Session',    content: <VoicePage /> },
                        { label: 'Session History',  content: <VoiceSessionHistoryPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/triage" element={
                  <MfeErrorBoundary name="Triage">
                    <TabbedPageLayout
                      title="Triage"
                      storageKey="hq:tab-triage"
                      tabs={[
                        { label: 'AI Triage',       content: <TriagePage /> },
                        { label: 'Clinical Coding', content: <ClinicalCoderPanelPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/scheduling" element={
                  <MfeErrorBoundary name="Scheduling">
                    <TabbedPageLayout
                      title="Scheduling"
                      storageKey="hq:tab-scheduling"
                      tabs={[
                        { label: 'Calendar',         content: <SchedulingPage /> },
                        { label: 'Book Appointment', content: <BookingFormPage /> },
                        { label: 'Waitlist',         content: <WaitlistPanelPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/population-health" element={
                  <MfeErrorBoundary name="Population Health">
                    <TabbedPageLayout
                      title="Population Health"
                      storageKey="hq:tab-population-health"
                      tabs={[
                        { label: 'Risk Overview',    content: <PopHealthPage /> },
                        { label: 'Care Gaps',        content: <CareGapListPage /> },
                        { label: 'Risk Trajectory',  content: <RiskTrajectoryPanelPage /> },
                        { label: 'SDOH',             content: <SdohAssessmentPanelPage /> },
                        { label: 'Cost Prediction',  content: <CostPredictionPanelPage /> },
                        { label: 'HEDIS Measures',   content: <HedisMeasuresPanelPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/revenue" element={
                  <MfeErrorBoundary name="Revenue">
                    <TabbedPageLayout
                      title="Revenue Cycle"
                      storageKey="hq:tab-revenue"
                      tabs={[
                        { label: 'Coding Queue', content: <RevenuePage /> },
                        { label: 'Prior Auth',   content: <PriorAuthTrackerPage /> },
                        { label: 'Denials',      content: <DenialManagerPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/encounters" element={
                  <MfeErrorBoundary name="Encounters">
                    <TabbedPageLayout
                      title="Encounters"
                      storageKey="hq:tab-encounters"
                      tabs={[
                        { label: 'Overview',              content: <EncountersPage /> },
                        { label: 'Medications & Allergies', content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><MedicationPanelPage /><AllergyPanelPage /></Box> },
                        { label: 'Clinical Records',       content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><ProblemListPanelPage /><ImmunizationPanelPage /></Box> },
                        { label: 'FHIR & Labs',            content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><FhirObservationViewerPage /><FhirEverythingViewerPage /><LabDeltaFlagsPanelPage /></Box> },
                        { label: 'Drug Interactions',      content: <DrugInteractionCheckerPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/patient-portal" element={
                  <MfeErrorBoundary name="Patient Portal">
                    <TabbedPageLayout
                      title="Patient Portal"
                      storageKey="hq:tab-patient-portal"
                      tabs={[
                        { label: 'Portal',         content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><EngagementPage /><PatientProfilePanelPage /></Box> },
                        { label: 'Registration',   content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><PatientRegistrationPanelPage /><OtpVerificationPanelPage /></Box> },
                        { label: 'Documents',      content: <OcrDocumentPanelPage /> },
                        { label: 'Notifications',  content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><DeliveryAnalyticsDashboardPage /><PushSubscriptionPanelPage /></Box> },
                        { label: 'Consent & GDPR', content: <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}><ConsentManagementPanelPage /><GdprErasurePanelPage /></Box> },
                        { label: 'Campaigns',      content: <CampaignManagerPanelPage /> },
                      ]}
                    />
                  </MfeErrorBoundary>
                } />
                <Route path="/governance" element={
                  <MfeErrorBoundary name="Governance">
                    <TabbedPageLayout
                      title="AI Governance"
                      storageKey="hq:tab-governance"
                      tabs={[
                        { label: 'Overview',       content: <ModelGovernanceDashboardPage /> },
                        { label: 'Evaluate',       content: <ModelEvaluationPanelPage /> },
                        { label: 'Register Model', content: <ModelRegisterPanelPage /> },
                        { label: 'Experiments',    content: <ExperimentSummaryPanelPage /> },
                        { label: 'XAI',            content: <XaiExplanationPanelPage /> },
                        { label: 'ML Confidence',  content: <MlConfidencePanelPage /> },
                      ]}
                    />
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
                <Route path="/admin/health" element={
                  <MfeErrorBoundary name="Platform Health">
                    <PlatformHealthPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin" element={
                  <MfeErrorBoundary name="Admin Settings">
                    <AdminSettingsPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/profile" element={
                  <MfeErrorBoundary name="User Profile">
                    <UserProfilePage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/preferences" element={
                  <MfeErrorBoundary name="Preferences">
                    <UserPreferencesPanelPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/alerts" element={
                  <MfeErrorBoundary name="Clinical Alerts">
                    <ClinicalAlertsCenterPage />
                  </MfeErrorBoundary>
                } />
                <Route path="/admin/reports" element={
                  <MfeErrorBoundary name="Reports">
                    <ReportsExportPanelPage />
                  </MfeErrorBoundary>
                } />
                {/* Phase 38 — 404 catch-all (must be last) */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </Box>
        </Box>
        <CopilotChat />
        <CommandPalette open={paletteOpen} onClose={closePalette} />
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
        <SessionExpiryGuard />
        <QuickActionsSpeedDial />
        <OnboardingWizard /> {/* Phase 38 — first-run onboarding */}
        {isDemoActive && <AutoDemoPlayer />} {/* Phase 58 — AI self-driven demo */}
      </Box>
    </SidebarProvider>
  );
}
