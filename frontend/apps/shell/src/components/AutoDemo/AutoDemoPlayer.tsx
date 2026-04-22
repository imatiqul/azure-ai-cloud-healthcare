/**
 * Phase 58 — AutoDemoPlayer
 *
 * Mounts globally in the shell when isDemoActive = true.
 * Orchestrates:
 *  1. Route navigation to the current scene's route
 *  2. Word-by-word typewriter narration streaming
 *  3. Countdown timer → auto-advances to next scene
 *  4. Renders DemoNarratorPanel (bottom-left) + DemoControlBar (bottom-center)
 *
 * The component itself renders no visible layout — it only mounts the two
 * floating UI panels and drives the timer/navigation logic.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalStore } from '../../store';
import { DEMO_WORKFLOWS } from './demoScripts';
import { DemoNarratorPanel } from './DemoNarratorPanel';
import { DemoControlBar } from './DemoControlBar';
import { DemoCompletionOverlay } from './DemoCompletionOverlay';

// How many milliseconds between each word appearing in the typewriter
const WORD_INTERVAL_MS = 110;

export function AutoDemoPlayer() {
  const navigate = useNavigate();

  const {
    isDemoActive,
    demoWorkflowIdx,
    demoSceneIdx,
    demoPaused,
    demoSpeed,
    isDemoComplete,
    advanceDemoScene,
    prevDemoScene,
    pauseDemo,
    resumeDemo,
    exitDemo,
    setDemoScene,
  } = useGlobalStore();

  const [narrationText, setNarrationText] = useState('');
  const [countdown, setCountdown] = useState(30);

  // Stable refs so interval callbacks always see the latest values
  const narrationRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoPausedRef   = useRef(demoPaused);
  const advanceRef      = useRef(advanceDemoScene);
  const prevRef         = useRef(prevDemoScene);
  const pauseRef        = useRef(pauseDemo);
  const resumeRef       = useRef(resumeDemo);
  const exitRef         = useRef(exitDemo);
  const setDemoSceneRef = useRef(setDemoScene);
  const demoSpeedRef    = useRef(demoSpeed);

  useEffect(() => { demoPausedRef.current   = demoPaused; },       [demoPaused]);
  useEffect(() => { advanceRef.current      = advanceDemoScene; }, [advanceDemoScene]);
  useEffect(() => { prevRef.current         = prevDemoScene; },    [prevDemoScene]);
  useEffect(() => { pauseRef.current        = pauseDemo; },        [pauseDemo]);
  useEffect(() => { resumeRef.current       = resumeDemo; },       [resumeDemo]);
  useEffect(() => { exitRef.current         = exitDemo; },         [exitDemo]);
  useEffect(() => { setDemoSceneRef.current = setDemoScene; },     [setDemoScene]);
  useEffect(() => { demoSpeedRef.current    = demoSpeed; },        [demoSpeed]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDemoActive) return;
    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          demoPausedRef.current ? resumeRef.current() : pauseRef.current();
          break;
        case 'ArrowRight':
          e.preventDefault();
          advanceRef.current();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevRef.current();
          break;
        case 'Escape':
          e.preventDefault();
          exitRef.current();
          break;
        default:
          // 1–8 → jump to that workflow (index 0–7)
          if (e.key >= '1' && e.key <= '8') {
            const wfIdx = parseInt(e.key, 10) - 1;
            setDemoSceneRef.current(wfIdx, 0);
          }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isDemoActive]);

  // ── Live KPI badge — fetch once when demo starts ──────────────────────────
  const API_BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_BASE_URL ?? '';
  interface LiveInsights { pendingTriage: number; highRiskPatients: number; codingQueue: number; bookedToday: number; triageAiAccuracy: number }
  const [liveKpi, setLiveKpi] = useState<LiveInsights | null>(null);

  useEffect(() => {
    if (!isDemoActive) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/agents/demo/live-insights`)
      .then(r => r.ok ? r.json() as Promise<LiveInsights> : Promise.reject())
      .then(data => { if (!cancelled) setLiveKpi(data); })
      .catch(() => { /* silent — demo works without live KPIs */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoActive]);
  const clearNarration = useCallback(() => {
    if (narrationRef.current !== null) {
      clearInterval(narrationRef.current);
      narrationRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // ── Scene change effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isDemoActive) return;

    const workflow = DEMO_WORKFLOWS[demoWorkflowIdx];
    const scene    = workflow?.scenes[demoSceneIdx];
    if (!scene) return;

    // Navigate to the scene's route
    navigate(scene.route);

    // Reset narration
    clearNarration();
    setNarrationText('');
    const words   = scene.narration.split(' ');
    let wordIdx   = 0;

    narrationRef.current = setInterval(() => {
      if (wordIdx < words.length) {
        setNarrationText(prev =>
          wordIdx === 0 ? words[0] : prev + ' ' + words[wordIdx],
        );
        wordIdx++;
      } else {
        clearNarration();
      }
    }, WORD_INTERVAL_MS);

    // Reset countdown
    clearCountdown();
    setCountdown(scene.durationSec);
    countdownRef.current = setInterval(() => {
      // Respect pause
      if (demoPausedRef.current) return;

      setCountdown(prev => {
        const tick = demoSpeedRef.current ?? 1;
        const next = prev - tick;
        if (next <= 0) {
          clearCountdown();
          advanceRef.current();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearNarration();
      clearCountdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoActive, demoWorkflowIdx, demoSceneIdx]);

  // ── Pause / resume: simply freeze the interval via the ref flag ───────────
  // (The interval keeps ticking but the decrement is a no-op when paused — see above)

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearNarration();
      clearCountdown();
    };
  }, [clearNarration, clearCountdown]);

  if (!isDemoActive) return null;

  const workflow = DEMO_WORKFLOWS[demoWorkflowIdx];
  const scene    = workflow?.scenes[demoSceneIdx];
  if (!workflow || !scene) return null;

  return (
    <>
      {isDemoComplete && <DemoCompletionOverlay />}
      {!isDemoComplete && (
        <>
          <DemoNarratorPanel
            workflow={workflow}
            scene={scene}
            narrationText={narrationText}
            workflowIdx={demoWorkflowIdx}
            sceneIdx={demoSceneIdx}
            countdown={countdown}
            totalSec={scene.durationSec}
            liveKpi={liveKpi}
          />
          <DemoControlBar
            countdown={countdown}
            totalSec={scene.durationSec}
          />
        </>
      )}
    </>
  );
}
