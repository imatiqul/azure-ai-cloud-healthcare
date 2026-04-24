interface HitlEscalationModalProps {
    workflowId: string;
    sessionId?: string;
    patientId?: string;
    patientName?: string;
    triageLevel?: string;
    agentReasoning?: string;
    onApprove: () => void;
    onClose: () => void;
}
export declare function HitlEscalationModal({ workflowId, sessionId, patientId, patientName, triageLevel, agentReasoning, onApprove, onClose, }: HitlEscalationModalProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=HitlEscalationModal.d.ts.map