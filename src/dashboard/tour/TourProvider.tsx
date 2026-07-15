/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { TOUR_STEPS, type TourStep } from "./steps";

const COMPLETE_KEY = "living-vault:tour-complete";

interface TourValue {
  active: boolean;
  index: number;
  step: TourStep | null;
  total: number;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
}

const TourContext = createContext<TourValue | undefined>(undefined);

function readComplete(): boolean {
  try {
    return Boolean(globalThis.localStorage?.getItem(COMPLETE_KEY));
  } catch {
    return false;
  }
}

function markComplete(): void {
  try {
    globalThis.localStorage?.setItem(COMPLETE_KEY, "1");
  } catch {
    /* storage unavailable; completion just is not remembered next session */
  }
}

/**
 * Drives the guided tour. Holds the active step index, navigates to each step's
 * route as the index advances, and persists completion so the auto-offer fires
 * at most once. The overlay is a separate component that reads this context, so
 * the provider has no DOM concerns and stays trivially testable.
 */
export function TourProvider({
  children,
  autoStart = false,
}: {
  children: ReactNode;
  autoStart?: boolean;
}) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  const start = useCallback(() => {
    setIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    markComplete();
  }, []);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= TOUR_STEPS.length - 1) {
        setActive(false);
        markComplete();
        return current;
      }
      return current + 1;
    });
  }, []);

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const step = active ? (TOUR_STEPS[index] ?? null) : null;

  useEffect(() => {
    if (active && step) navigate(step.route);
  }, [active, step, navigate]);

  useEffect(() => {
    if (autoStart && !readComplete()) {
      setIndex(0);
      setActive(true);
    }
  }, [autoStart]);

  const value = useMemo<TourValue>(
    () => ({
      active,
      index,
      step,
      total: TOUR_STEPS.length,
      start,
      next,
      back,
      stop,
    }),
    [active, index, step, start, next, back, stop],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourValue {
  const context = useContext(TourContext);
  if (!context) throw new Error("useTour must be used within TourProvider");
  return context;
}
