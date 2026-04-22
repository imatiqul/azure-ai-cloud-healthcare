import { create } from 'zustand';

export interface ActivePatient {
  id:         string;
  name?:      string;
  riskLevel?: string; // 'Critical' | 'High' | 'Low'
}

export interface GlobalState {
  currentPatientId: string | null;
  activeSessionId:  string | null;
  userRole:         string | null;
  activePatient:    ActivePatient | null;       // Phase 49
  setSession:       (id: string | null) => void;
  setPatient:       (id: string | null) => void;
  setUserRole:      (role: string | null) => void;
  setActivePatient: (patient: ActivePatient | null) => void; // Phase 49
  clearActivePatient: () => void;                            // Phase 49

  // Phase 58 — AI Self-Driven Demo orchestration
  isDemoActive:          boolean;
  demoWorkflowIdx:       number;
  demoSceneIdx:          number;
  demoPaused:            boolean;
  demoClientName:        string;
  demoCompany:           string;
  startSelfDrivenDemo:   (clientName: string, company: string) => void;
  advanceDemoScene:      () => void;
  prevDemoScene:         () => void;
  pauseDemo:             () => void;
  resumeDemo:            () => void;
  exitDemo:              () => void;
  setDemoScene:          (workflowIdx: number, sceneIdx: number) => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  currentPatientId: null,
  activeSessionId:  null,
  userRole:         null,
  activePatient:    null,
  setSession:       (id)      => set({ activeSessionId: id }),
  setPatient:       (id)      => set({ currentPatientId: id }),
  setUserRole:      (role)    => set({ userRole: role }),
  setActivePatient: (patient) => set({
    activePatient:    patient,
    currentPatientId: patient?.id ?? null,
  }),
  clearActivePatient: () => set({ activePatient: null, currentPatientId: null }),

  // Phase 58 — AI Self-Driven Demo defaults
  isDemoActive:    false,
  demoWorkflowIdx: 0,
  demoSceneIdx:    0,
  demoPaused:      false,
  demoClientName:  '',
  demoCompany:     '',

  startSelfDrivenDemo: (clientName, company) =>
    set({ isDemoActive: true, demoWorkflowIdx: 0, demoSceneIdx: 0, demoPaused: false, demoClientName: clientName, demoCompany: company }),

  advanceDemoScene: () =>
    set((state) => {
      // Lazy import to avoid circular dep at module level — use a flat total from env
      const SCENES_PER_WORKFLOW = [3, 3, 3, 3, 3, 3, 3, 3]; // kept in sync with demoScripts
      const workflowCount = SCENES_PER_WORKFLOW.length;
      const sceneCount = SCENES_PER_WORKFLOW[state.demoWorkflowIdx] ?? 3;
      const nextScene = state.demoSceneIdx + 1;
      if (nextScene < sceneCount) {
        return { demoSceneIdx: nextScene };
      }
      const nextWorkflow = state.demoWorkflowIdx + 1;
      if (nextWorkflow < workflowCount) {
        return { demoWorkflowIdx: nextWorkflow, demoSceneIdx: 0 };
      }
      // Demo complete — stay on last scene, mark paused
      return { demoPaused: true };
    }),

  prevDemoScene: () =>
    set((state) => {
      const SCENES_PER_WORKFLOW = [3, 3, 3, 3, 3, 3, 3, 3];
      if (state.demoSceneIdx > 0) {
        return { demoSceneIdx: state.demoSceneIdx - 1 };
      }
      const prevWorkflow = state.demoWorkflowIdx - 1;
      if (prevWorkflow >= 0) {
        const prevSceneCount = SCENES_PER_WORKFLOW[prevWorkflow] ?? 3;
        return { demoWorkflowIdx: prevWorkflow, demoSceneIdx: prevSceneCount - 1 };
      }
      return {};
    }),

  pauseDemo:  () => set({ demoPaused: true }),
  resumeDemo: () => set({ demoPaused: false }),
  exitDemo:   () => set({ isDemoActive: false, demoWorkflowIdx: 0, demoSceneIdx: 0, demoPaused: false }),

  setDemoScene: (workflowIdx, sceneIdx) =>
    set({ demoWorkflowIdx: workflowIdx, demoSceneIdx: sceneIdx, demoPaused: false }),
}));
