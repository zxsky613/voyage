import { useCallback, useEffect, useRef, useState } from "react";
import {
  GENERATION_PHASE_PERCENT,
  GENERATION_STALL_MS,
  GENERATION_CREEP_INTERVAL_MS,
  creepCapPercent,
  tickSimulatedProgress,
} from "./generationProgress.js";

const INITIAL_DISPLAY = 3;

/**
 * Barre monotone : jalons serveur + lente simulation entre deux phases.
 * Avertissement honnête si aucun jalon serveur pendant 90 s.
 */
export function useGenerationProgressDisplay() {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("");
  const [milestonePercent, setMilestonePercent] = useState(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [slowWarning, setSlowWarning] = useState(false);

  const lastServerAtRef = useRef(0);
  const milestoneRef = useRef(0);
  const displayRef = useRef(0);

  const reset = useCallback(() => {
    lastServerAtRef.current = Date.now();
    milestoneRef.current = 0;
    displayRef.current = INITIAL_DISPLAY;
    setPhase("");
    setMilestonePercent(0);
    setDisplayPercent(INITIAL_DISPLAY);
    setSlowWarning(false);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    milestoneRef.current = 100;
    displayRef.current = 100;
    setMilestonePercent(100);
    setDisplayPercent(100);
    setPhase("ready");
    setSlowWarning(false);
    setActive(false);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    setSlowWarning(false);
  }, []);

  const onServerProgress = useCallback((serverPhase, percent) => {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    lastServerAtRef.current = Date.now();
    setSlowWarning(false);
    setPhase(String(serverPhase || "").trim());
    milestoneRef.current = Math.max(milestoneRef.current, pct);
    displayRef.current = Math.max(displayRef.current, milestoneRef.current);
    setMilestonePercent(milestoneRef.current);
    setDisplayPercent(displayRef.current);
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    const id = window.setInterval(() => {
      const milestone = milestoneRef.current;
      const cap = creepCapPercent(milestone);
      const nextDisplay = tickSimulatedProgress(displayRef.current, milestone, cap);
      if (nextDisplay > displayRef.current) {
        displayRef.current = nextDisplay;
        setDisplayPercent(nextDisplay);
      }
      if (Date.now() - lastServerAtRef.current >= GENERATION_STALL_MS) {
        setSlowWarning(true);
      }
    }, GENERATION_CREEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [active]);

  return {
    active,
    phase,
    milestonePercent,
    displayPercent,
    slowWarning,
    reset,
    finish,
    cancel,
    onServerProgress,
    phasePercentMap: GENERATION_PHASE_PERCENT,
  };
}
