// src/dashboard/monitor/monitorFilters.ts
import type { ActionSeverity, Quadrant } from "@/data/metrics";
import type { AssetType } from "@/data/types";

import type { ExceptionKind, ExceptionRow } from "./exceptionQueue";
import type { MonitorNode } from "./monitorMeta";
import { isActionable, type TriageState } from "./triageStore";

/** One independent filter per dimension. Non-"all" values combine with AND. */
export interface MonitorFilters {
  health: "all" | Quadrant;
  issue: "all" | ExceptionKind;
  type: "all" | AssetType;
  bundle: "all" | string;
  domain: "all" | string;
  severity: "all" | ActionSeverity;
}

export const defaultMonitorFilters: MonitorFilters = {
  health: "all",
  issue: "all",
  type: "all",
  bundle: "all",
  domain: "all",
  severity: "all",
};

export type MonitorView = "actionable" | "all";

/**
 * Per-asset bundle and domain membership, precomputed once so the pure filters
 * never re-walk bundleMemberships and assetTags per row.
 */
export type MonitorIndex = Map<
  string,
  { bundleIds: Set<string>; domainTagIds: Set<string> }
>;

/**
 * The five dimensions shared by the queue and the canvas: health, type, issue,
 * bundle, domain. Severity and the view gate are exception-only and applied in
 * filterExceptions, not here, because nodes have no severity band.
 */
function passesNodeDimensions(
  assetId: string,
  type: AssetType,
  quadrant: Quadrant,
  issue: ExceptionKind | undefined,
  filters: MonitorFilters,
  index: MonitorIndex,
): boolean {
  if (filters.health !== "all" && quadrant !== filters.health) return false;
  if (filters.type !== "all" && type !== filters.type) return false;
  if (filters.issue !== "all" && issue !== filters.issue) return false;
  const entry = index.get(assetId);
  if (filters.bundle !== "all" && !entry?.bundleIds.has(filters.bundle)) return false;
  if (filters.domain !== "all" && !entry?.domainTagIds.has(filters.domain)) return false;
  return true;
}

/**
 * The displayed queue. The view gate runs first (actionable keeps only rows where
 * isActionable is true; all keeps every row so handled rows stay visible with a
 * Restore affordance), then severity, then the shared dimensions. Engine order is
 * preserved.
 */
export function filterExceptions(
  queue: ExceptionRow[],
  filters: MonitorFilters,
  triage: TriageState,
  view: MonitorView,
  now: Date,
  index: MonitorIndex,
): ExceptionRow[] {
  return queue.filter((row) => {
    if (view === "actionable" && !isActionable(row, triage, now)) return false;
    if (filters.severity !== "all" && row.severityBand !== filters.severity) return false;
    return passesNodeDimensions(
      row.assetId,
      row.type as AssetType,
      row.score.quadrant,
      row.kind,
      filters,
      index,
    );
  });
}

/**
 * The node ids that pass the shared dimension filters, for the canvas to emphasize.
 * An all-"all" filter returns every id so nothing is dimmed. Severity is not applied
 * because a node is not an exception and has no band.
 */
export function matchingNodeIds(
  nodes: MonitorNode[],
  filters: MonitorFilters,
  issueByAsset: Map<string, ExceptionKind>,
  index: MonitorIndex,
): Set<string> {
  const out = new Set<string>();
  for (const node of nodes) {
    const ok = passesNodeDimensions(
      node.id,
      node.type as AssetType,
      node.quadrant,
      issueByAsset.get(node.id),
      filters,
      index,
    );
    if (ok) out.add(node.id);
  }
  return out;
}
