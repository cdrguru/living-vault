// src/dashboard/monitor/triageStore.ts
import { useEffect, useState } from "react";

import type { ExceptionRow } from "./exceptionQueue";

/** How an exception was handled. snoozed rows reappear once snoozedUntil passes. */
export type TriageStatus = "acknowledged" | "dismissed" | "snoozed";

export interface TriageEntry {
  status: TriageStatus;
  /** ISO date; present only for snoozed entries. */
  snoozedUntil?: string;
}

export type TriageState = Record<string, TriageEntry>;

/** Distinct from the layout key so triage and layout never clobber each other. */
export const TRIAGE_STORAGE_KEY = "vault.monitor.triage.v1";

function readStored(): TriageState {
  try {
    const raw = globalThis.localStorage?.getItem(TRIAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as TriageState;
  } catch {
    return {};
  }
}

export function loadTriage(): TriageState {
  return readStored();
}

export function saveTriage(state: TriageState): void {
  try {
    globalThis.localStorage?.setItem(TRIAGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort: private mode or quota pressure. In-memory triage still works.
  }
}

/**
 * A row is actionable when its severity band is medium or high AND it is not
 * acknowledged, not dismissed, and not currently snoozed. A snooze whose
 * snoozedUntil is in the past is treated as expired, so the row returns.
 */
export function isActionable(
  row: ExceptionRow,
  state: TriageState,
  now: Date,
): boolean {
  if (row.severityBand === "low") return false;
  const entry = state[row.assetId];
  if (!entry) return true;
  if (entry.status === "acknowledged" || entry.status === "dismissed") return false;
  if (entry.status === "snoozed") {
    if (!entry.snoozedUntil) return true;
    return new Date(entry.snoozedUntil).getTime() <= now.getTime();
  }
  return true;
}

export interface TriageApi {
  state: TriageState;
  acknowledge: (assetId: string) => void;
  dismiss: (assetId: string) => void;
  snooze: (assetId: string, days: number) => void;
  restore: (assetId: string) => void;
}

/**
 * Owns triage state for the page, persisting on every change, the way
 * useMonitorCanvas owns and persists layout. Defined here but first consumed in
 * Phase 3 when the queue gains its action buttons.
 */
export function useTriage(): TriageApi {
  const [state, setState] = useState<TriageState>(() => loadTriage());

  useEffect(() => {
    saveTriage(state);
  }, [state]);

  const set = (assetId: string, entry: TriageEntry | null) =>
    setState((current) => {
      const next = { ...current };
      if (entry === null) delete next[assetId];
      else next[assetId] = entry;
      return next;
    });

  return {
    state,
    acknowledge: (assetId) => set(assetId, { status: "acknowledged" }),
    dismiss: (assetId) => set(assetId, { status: "dismissed" }),
    snooze: (assetId, days) =>
      set(assetId, {
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + days * 86_400_000).toISOString(),
      }),
    restore: (assetId) => set(assetId, null),
  };
}
