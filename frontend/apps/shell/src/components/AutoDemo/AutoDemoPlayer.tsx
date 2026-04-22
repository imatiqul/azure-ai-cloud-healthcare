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
  } = useGlobalStore();

  const [narrationText, setNarrationText] = useState('');
  const [countdown, setCountdown] = useState(30);

  // Stable refs so interval callbacks always see the latest values
  const narrationRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoPausedRef = useRef(demoPaused);
  const advanceRef    = useRef(advanceDemoScene);
  const demoSpeedRef  = useRef(demoSpeed);

  useEffect(() => { demoPausedRef.current = demoPaused; }, [demoPaused]);
  useEffect(() => { advanceRef.current    = advanceDemoScene; }, [advanceDemoScene]);
  useEffect(() => { demoSpeedRef.current  = demoSpeed; }, [demoSpeed]);

  // ── Clear helpers ─────────────────────────────────────────────────────────
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
