import {
  recommendedActions,
  scoreAsset,
  type ActionSeverity,
  type AssetScore,
  type RecommendedActionKind,
} from "@/data/metrics";
import type { VaultDataset } from "@/data/types";

import type { NodeTone } from "./monitorMeta";
import { isActionable, type TriageState } from "./triageStore";

/**
 * The severity-ordered exception queue, sourced from the shared recommendedActions
 * engine in metrics.ts so the Monitor and the Overview top-fixes read from one
 * source of truth. The engine ranks each asset's single most urgent gap severity
 * descending; this adapter maps each recommendation onto the Monitor's display
 * shape (a coarse tone-and-glyph kind plus the engine's precise label and a
 * plain-English reason). The ExceptionRow shape is unchanged so MonitorPage needs
 * no edit.
 */

export type ExceptionKind = "risk" | "shelfware" | "dead-weight" | "stale";

export interface ExceptionRow {
  assetId: string;
  name: string;
  type: string;
  kind: ExceptionKind;
  /** Higher means more severe. Mirrors the engine ranking, never alphabetical. */
  severity: number;
  /** The engine severity band, used for severity filtering and the actionable threshold. */
  severityBand: ActionSeverity;
  tone: NodeTone;
  label: string;
  reason: string;
  score: AssetScore;
}

// The engine has seven recommendation kinds; the Monitor renders four glyphs.
// Map each engine kind to its display bucket: the high-severity gaps read as a
// risk glyph, freshness as stale, and the rest as the warn-toned shelfware glyph.
const DISPLAY_KIND: Record<RecommendedActionKind, ExceptionKind> = {
  risk: "risk",
  regressing: "risk",
  "fragile-deps": "risk",
  duplicate: "shelfware",
  shelfware: "shelfware",
  orphan: "shelfware",
  stale: "stale",
  governance: "shelfware",
};

const TONE: Record<ExceptionKind, NodeTone> = {
  risk: "danger",
  shelfware: "warn",
  "dead-weight": "muted",
  stale: "warn",
};

// A plain-English reason per engine kind. The engine's own label is the short
// headline; this is the one-line explanation rendered under it.
const REASON: Record<RecommendedActionKind, string> = {
  risk: "Used but not governed. Add an owner, tags, and an origin.",
  regressing:
    "Effectiveness has dropped versus the prior window. Investigate before it becomes dead weight.",
  "fragile-deps":
    "Depends on a deprecated or retired asset. Replace the dependency.",
  duplicate:
    "Shares a content hash with another asset. Consolidate the duplicates.",
  shelfware: "Governed but not effective. Low usage or a low success rate.",
  orphan: "Active but has no owner. Assign one.",
  stale: "Not updated in over 180 days. Confirm it is still current.",
  governance: "Missing governance metadata. Complete its checklist.",
};

// Numeric severity for any consumer that re-sorts, mirroring the engine ranking
// so the queue order matches recommendedActions exactly.
const SEVERITY_RANK: Record<ActionSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};
const KIND_RANK: Record<RecommendedActionKind, number> = {
  risk: 8,
  regressing: 7,
  "fragile-deps": 6,
  duplicate: 5,
  shelfware: 4,
  orphan: 3,
  stale: 2,
  governance: 1,
};

/**
 * Count assets that genuinely need attention now: the exception-queue rows that
 * are actionable under the same gate the Monitor's default view applies (medium or
 * high severity, and not acknowledged/dismissed/snoozed). The Overview attention
 * chip passes the live triage state so its number matches the queue the Monitor
 * actually renders, including dropping rows as the owner triages them. Defaults to
 * an empty triage state for callers (tests) that do not track triage.
 */
export function needsAttentionCount(
  dataset: VaultDataset,
  triage: TriageState = {},
  now: Date = new Date(),
): number {
  return exceptionQueue(dataset).filter((row) => isActionable(row, triage, now))
    .length;
}

/**
 * Map the ranked recommendations onto Monitor exception rows, preserving the
 * engine's severity-descending order. Each flagged asset appears once, under its
 * single most urgent gap.
 */
export function exceptionQueue(dataset: VaultDataset): ExceptionRow[] {
  return recommendedActions(dataset).map((action) => {
    const kind = DISPLAY_KIND[action.kind];
    return {
      assetId: action.assetId,
      name: action.asset.name,
      type: action.asset.type,
      kind,
      severity: SEVERITY_RANK[action.severity] * 10 + KIND_RANK[action.kind],
      severityBand: action.severity,
      tone: TONE[kind],
      label: action.label,
      reason: REASON[action.kind],
      score: scoreAsset(action.asset, dataset),
    };
  });
}
