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
  // Phase 61 additions
  demoSpeed:             number;    // 1 = normal · 2 = 2× fast-forward
  isDemoComplete:        boolean;   // true after the last scene auto-advances
  // Phase 64 additions
  demoWorkflowIndices:   number[];  // which workflow indices to include; empty = all 8
  setDemoWorkflowIndices:(indices: number[]) => void;
  startSelfDrivenDemo:   (clientName: string, company: string) => void;
  advanceDemoScene:      () => void;
  prevDemoScene:         () => void;
  pauseDemo:             () => void;
  resumeDemo:            () => void;
  exitDemo:              () => void;
  setDemoScene:          (workflowIdx: number, sceneIdx: number) => void;
  setDemoSpeed:          (speed: number) => void;
  markDemoComplete:      () => void;
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
  // Phase 61 additions
  demoSpeed:       1,
  isDemoComplete:  false,
  // Phase 64 additions
  demoWorkflowIndices: [],

  setDemoWorkflowIndices: (indices) => set({ demoWorkflowIndices: indices }),

  startSelfDrivenDemo: (clientName, company) =>
    set((state) => {
      const indices = state.demoWorkflowIndices.length > 0
        ? state.demoWorkflowIndices
        : [0, 1, 2, 3, 4, 5, 6, 7];
      return { isDemoActive: true, demoWorkflowIdx: indices[0], demoSceneIdx: 0, demoPaused: false, isDemoComplete: false, demoClientName: clientName, demoCompany: company };
    }),

  advanceDemoScene: () =>
    set((state) => {
      const SCENES_PER_WORKFLOW = [3, 3, 3, 3, 3, 3, 3, 3]; // kept in sync with demoScripts
      const allIndices = Array.from({ length: SCENES_PER_WORKFLOW.length }, (_, i) => i);
      const indices = state.demoWorkflowIndices.length > 0 ? state.demoWorkflowIndices : allIndices;
      const sceneCount = SCENES_PER_WORKFLOW[state.demoWorkflowIdx] ?? 3;
      const nextScene = state.demoSceneIdx + 1;
      if (nextScene < sceneCount) {
        return { demoSceneIdx: nextScene };
      }
      const currentPos = indices.indexOf(state.demoWorkflowIdx);
      const nextPos = currentPos + 1;
      if (nextPos < indices.length) {
        return { demoWorkflowIdx: indices[nextPos], demoSceneIdx: 0 };
      }
      // Demo complete — stay on last scene, mark done
      return { demoPaused: true, isDemoComplete: true };
    }),

  prevDemoScene: () =>
    set((state) => {
      const SCENES_PER_WORKFLOW = [3, 3, 3, 3, 3, 3, 3, 3];
      const allIndices = Array.from({ length: SCENES_PER_WORKFLOW.length }, (_, i) => i);
      const indices = state.demoWorkflowIndices.length > 0 ? state.demoWorkflowIndices : allIndices;
      if (state.demoSceneIdx > 0) {
        return { demoSceneIdx: state.demoSceneIdx - 1 };
      }
      const currentPos = indices.indexOf(state.demoWorkflowIdx);
      const prevPos = currentPos - 1;
      if (prevPos >= 0) {
        const prevWorkflow = indices[prevPos];
        const prevSceneCount = SCENES_PER_WORKFLOW[prevWorkflow] ?? 3;
        return { demoWorkflowIdx: prevWorkflow, demoSceneIdx: prevSceneCount - 1 };
      }
      return {};
    }),

  pauseDemo:  () => set({ demoPaused: true }),
  resumeDemo: () => set({ demoPaused: false }),
  exitDemo:   () => set({ isDemoActive: false, demoWorkflowIdx: 0, demoSceneIdx: 0, demoPaused: false, isDemoComplete: false, demoSpeed: 1 }),

  setDemoScene: (workflowIdx, sceneIdx) =>
    set({ demoWorkflowIdx: workflowIdx, demoSceneIdx: sceneIdx, demoPaused: false }),

  // Phase 61
  setDemoSpeed:    (speed)  => set({ demoSpeed: speed }),
  markDemoComplete: ()      => set({ isDemoComplete: true, demoPaused: true }),
}));
