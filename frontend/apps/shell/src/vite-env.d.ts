/// <reference types="vite/client" />

declare module 'voice/VoiceSessionController' {
  export const VoiceSessionController: React.ComponentType;
}
declare module 'voice/LiveTranscriptFeed' {
  export const LiveTranscriptFeed: React.ComponentType<{ sessionId: string; onTriageUpdate?: (level: string) => void }>;
}
declare module 'triage/TriageViewer' {
  export const TriageViewer: React.ComponentType;
}
declare module 'triage/HitlEscalationModal' {
  export const HitlEscalationModal: React.ComponentType<{ workflowId: string; onApprove: () => void; onClose: () => void }>;
}
declare module 'scheduling/SlotCalendar' {
  export const SlotCalendar: React.ComponentType;
}
declare module 'scheduling/BookingForm' {
  export const BookingForm: React.ComponentType;
}
declare module 'scheduling/WaitlistPanel' {
  export const WaitlistPanel: React.ComponentType;
}
declare module 'pophealth/RiskPanel' {
  export const RiskPanel: React.ComponentType;
}
declare module 'pophealth/CareGapList' {
  export const CareGapList: React.ComponentType;
}
declare module 'pophealth/RiskTrajectoryPanel' {
  export const RiskTrajectoryPanel: React.ComponentType;
}
declare module 'revenue/CodingQueue' {
  export const CodingQueue: React.ComponentType;
}
declare module 'revenue/PriorAuthTracker' {
  export const PriorAuthTracker: React.ComponentType;
}
declare module 'revenue/DenialManager' {
  export const DenialManager: React.ComponentType;
}
declare module 'encounters/EncounterList' {
  export const EncounterList: React.ComponentType;
}
declare module 'encounters/CreateEncounterModal' {
  export const CreateEncounterModal: React.ComponentType<{
    patientId: string;
    onClose: () => void;
    onCreated: () => void;
  }>;
}
declare module 'engagement/PatientPortal' {
  export const PatientPortal: React.ComponentType<{ patientId?: string }>;
}
declare module 'engagement/NotificationInbox' {
  export const NotificationInbox: React.ComponentType<{ patientId: string }>;
}
declare module 'engagement/DeliveryAnalyticsDashboard' {
  export const DeliveryAnalyticsDashboard: React.ComponentType;
}
declare module 'encounters/LabDeltaFlagsPanel' {
  export const LabDeltaFlagsPanel: React.ComponentType;
}
declare module 'engagement/ConsentManagementPanel' {
  export const ConsentManagementPanel: React.ComponentType;
}
declare module 'voice/VoiceSessionHistory' {
  export const VoiceSessionHistory: React.ComponentType;
}
declare module 'encounters/DrugInteractionChecker' {
  export const DrugInteractionChecker: React.ComponentType;
}
declare module 'encounters/FhirObservationViewer' {
  export const FhirObservationViewer: React.ComponentType;
}
declare module 'pophealth/SdohAssessmentPanel' {
  export const SdohAssessmentPanel: React.ComponentType;
}
declare module 'pophealth/CostPredictionPanel' {
  export const CostPredictionPanel: React.ComponentType;
}
