import { inWindow, type DateWindow } from "./metrics";
import type { RoutingStatRow, VaultDataset } from "./types";

/**
 * Pure routing metrics over the routingStats table (imported by a router via
 * importRoutingStats). Scope discipline: every number here describes
 * ROUTED traffic only, the decisions the router itself observed. It says nothing
 * about usage that never went through the router, so callers must present these
 * as "of routed traffic", never as fleet-wide rates. Honesty discipline: a
 * missing measurement is null, never a coerced zero, and avoidedCostEstimate is
 * a MODELED counterfactual whose grade rides RoutingStatsMeta.tracked.
 */

/** Per-asset routing totals over a window. */
export interface RoutingSummary {
  assetId: string;
  localHits: number;
  externalFallbacks: number;
  belowThreshold: number;
  /** Measured external spend attributed to this asset's fallbacks, USD. */
  externalCost: number;
  /** Modeled external cost the local hits avoided, USD. Modeled, never measured. */
  avoidedCostEstimate: number;
}

/** Fleet routing totals over a window. */
export interface RoutingTotals {
  /** Routed decisions that resolved locally or fell back: localHits + externalFallbacks. */
  routedDecisions: number;
  localHits: number;
  externalFallbacks: number;
  belowThreshold: number;
  externalCost: number;
  avoidedCostEstimate: number;
  /**
   * localHits / (localHits + externalFallbacks), or null when nothing was routed
   * in the window. Zero over zero is not zero percent. belowThreshold decisions
   * resolved locally by policy, not by a confident match, so they are counted in
   * neither side of the rate.
   */
  hitRate: number | null;
}

const sum = (rows: RoutingStatRow[], pick: (row: RoutingStatRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export function routingStatsByAssetWindowed(
  dataset: VaultDataset,
  window?: DateWindow,
): Map<string, RoutingSummary> {
  const byAsset = new Map<string, RoutingSummary>();
  for (const row of dataset.routingStats) {
    if (!inWindow(row.date, window)) continue;
    const current = byAsset.get(row.assetId) ?? {
      assetId: row.assetId,
      localHits: 0,
      externalFallbacks: 0,
      belowThreshold: 0,
      externalCost: 0,
      avoidedCostEstimate: 0,
    };
    current.localHits += row.localHits;
    current.externalFallbacks += row.externalFallbacks;
    current.belowThreshold += row.belowThreshold;
    current.externalCost += row.externalCost;
    current.avoidedCostEstimate += row.avoidedCostEstimate;
    byAsset.set(row.assetId, current);
  }
  return byAsset;
}

export function routingStatsByAsset(
  dataset: VaultDataset,
): Map<string, RoutingSummary> {
  return routingStatsByAssetWindowed(dataset);
}

export function routingTotals(
  dataset: VaultDataset,
  window?: DateWindow,
): RoutingTotals {
  const rows = dataset.routingStats.filter((row) => inWindow(row.date, window));
  const localHits = sum(rows, (row) => row.localHits);
  const externalFallbacks = sum(rows, (row) => row.externalFallbacks);
  const routedDecisions = localHits + externalFallbacks;
  return {
    routedDecisions,
    localHits,
    externalFallbacks,
    belowThreshold: sum(rows, (row) => row.belowThreshold),
    externalCost: sum(rows, (row) => row.externalCost),
    avoidedCostEstimate: sum(rows, (row) => row.avoidedCostEstimate),
    hitRate: routedDecisions === 0 ? null : localHits / routedDecisions,
  };
}

/**
 * The routing cache hit rate: the share of routed decisions the vault answered
 * locally. Null when nothing was routed in the window, never 0 over 0.
 */
export function routingCacheHitRate(
  dataset: VaultDataset,
  window?: DateWindow,
): number | null {
  return routingTotals(dataset, window).hitRate;
}

/** Per-asset routing ROI: what routing through this asset saved, net of its cost. */
export interface RoutingRoi {
  assetId: string;
  localHits: number;
  /** Modeled external cost the local hits avoided (from the importer's model). */
  avoidedCostEstimate: number;
  /**
   * The asset's allocated share of local spend over the window, when the caller
   * supplies an allocation (allocateSpendByInvocations). Null when no allocation
   * is available: an unknown local cost must not read as free.
   */
  allocatedLocalCost: number | null;
  /**
   * avoidedCostEstimate minus allocatedLocalCost. Null when the local cost is
   * unknown, and ALWAYS a modeled figure, because its avoided-cost side is
   * modeled regardless of how well local spend is measured.
   */
  netSavingsEstimate: number | null;
}

/**
 * Per-skill routing ROI, ranked by modeled net savings (unknown-cost assets sort
 * by avoided cost alone). `allocatedSpend` is the per-asset local spend share the
 * caller derived (typically allocateSpendByInvocations over the same window);
 * omit it and every net figure is honestly null instead of pretending local
 * execution is free.
 */
export function routingRoiByAsset(
  dataset: VaultDataset,
  window?: DateWindow,
  allocatedSpend?: Map<string, number>,
): RoutingRoi[] {
  const summaries = [...routingStatsByAssetWindowed(dataset, window).values()];
  return summaries
    .map((summary): RoutingRoi => {
      const allocated = allocatedSpend?.get(summary.assetId) ?? null;
      return {
        assetId: summary.assetId,
        localHits: summary.localHits,
        avoidedCostEstimate: summary.avoidedCostEstimate,
        allocatedLocalCost: allocated,
        netSavingsEstimate:
          allocated === null ? null : summary.avoidedCostEstimate - allocated,
      };
    })
    .sort(
      (a, b) =>
        (b.netSavingsEstimate ?? b.avoidedCostEstimate) -
        (a.netSavingsEstimate ?? a.avoidedCostEstimate),
    );
}
