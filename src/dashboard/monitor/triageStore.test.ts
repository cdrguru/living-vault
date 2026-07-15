import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionSeverity } from "@/data/metrics";

import type { ExceptionRow } from "./exceptionQueue";
import {
  TRIAGE_STORAGE_KEY,
  isActionable,
  loadTriage,
  saveTriage,
  type TriageState,
} from "./triageStore";

const mkRow = (assetId: string, severityBand: ActionSeverity = "high"): ExceptionRow => ({
  assetId,
  name: assetId,
  type: "skill",
  kind: "risk",
  severity: 30,
  severityBand,
  tone: "danger",
  label: "x",
  reason: "x",
  // score is not read by isActionable; a thin cast keeps the fixture small.
  score: {} as ExceptionRow["score"],
});

const NOW = new Date("2026-06-13T00:00:00Z");

describe("triage storage key", () => {
  it("is distinct from the layout key so the two cannot clobber each other", () => {
    expect(TRIAGE_STORAGE_KEY).toBe("vault.monitor.triage.v1");
    expect(TRIAGE_STORAGE_KEY).not.toBe("vault.monitor.layout.v1");
  });
});

describe("isActionable", () => {
  it("keeps an untouched medium-or-high row", () => {
    expect(isActionable(mkRow("a", "high"), {}, NOW)).toBe(true);
    expect(isActionable(mkRow("a", "medium"), {}, NOW)).toBe(true);
  });

  it("drops a low severity row regardless of triage", () => {
    expect(isActionable(mkRow("a", "low"), {}, NOW)).toBe(false);
  });

  it("drops acknowledged and dismissed rows", () => {
    const state: TriageState = { a: { status: "acknowledged" }, b: { status: "dismissed" } };
    expect(isActionable(mkRow("a"), state, NOW)).toBe(false);
    expect(isActionable(mkRow("b"), state, NOW)).toBe(false);
  });

  it("hides a row snoozed into the future but restores it once expired", () => {
    const future: TriageState = { a: { status: "snoozed", snoozedUntil: "2026-06-20T00:00:00Z" } };
    expect(isActionable(mkRow("a"), future, NOW)).toBe(false);
    const past: TriageState = { a: { status: "snoozed", snoozedUntil: "2026-06-10T00:00:00Z" } };
    expect(isActionable(mkRow("a"), past, NOW)).toBe(true);
  });
});

describe("triage persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips state through storage", () => {
    saveTriage({ a: { status: "acknowledged" } });
    expect(loadTriage()).toEqual({ a: { status: "acknowledged" } });
  });

  it("returns empty state on corrupt storage", () => {
    localStorage.setItem(TRIAGE_STORAGE_KEY, "{not json");
    expect(loadTriage()).toEqual({});
  });

  it("swallows write failures so a triage click never throws", () => {
    const original = globalThis.localStorage;
    vi.stubGlobal("localStorage", {
      ...original,
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    try {
      expect(() => saveTriage({ a: { status: "dismissed" } })).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
