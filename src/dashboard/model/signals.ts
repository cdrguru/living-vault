import {
  dailySeries,
  inWindow,
  scoreAsset,
  scoreAssets,
  utilizationByAssetWindowed,
  type DateWindow,
} from "@/data/metrics";
import type { VaultDataset } from "@/data/types";
import type { TableId } from "./modelMeta";

/**
 * Operational signal rolled up to table grain for the canvas cards. Governance,
 * effectiveness, and staleness reflect the current asset state; invocations,
 * error rate, and the daily series respect the selected time window. `hasTelemetry`
 * distinguishes a measured zero from no usage data at all.
 */
export interface TableSignal {
  assetCount: number;
  governedRate: number;
  effectiveRate: number;
  errorRate: number;
  staleCount: number;
  invocations: number;
  series: number[];
  hasTelemetry: boolean;
}

/** A node's health at a glance, derived from its operational signal. */
export type HealthStatus = "healthy" | "attention" | "at-risk" | "unknown";

/**
 * Collapse an operational signal into a single health verdict for the Health
 * view. Unknown when there is no telemetry to judge; at-risk when errors are
 * high or effectiveness collapses; attention for stale assets or middling
 * effectiveness; otherwise healthy. Thresholds live here so the canvas and any
 * future per-node monitor read health the same way.
 */
export function healthStatus(signal: TableSignal | null): HealthStatus {
  if (!signal || !signal.hasTelemetry) return "unknown";
  if (signal.errorRate >= 0.1 || signal.effectiveRate < 0.2) return "at-risk";
  if (signal.staleCount > 0 || signal.effectiveRate < 0.5) return "attention";
  return "healthy";
}

/**
 * The operational signal for a table card, or null for structural tables that
 * carry no asset population. v1 lights up the Asset hub; other tables can gain
 * tailored rollups later without changing the card contract.
 */
export function tableSignal(
  dataset: VaultDataset,
  tableId: TableId,
  window?: DateWindow,
): TableSignal | null {
  if (tableId !== "Asset") return null;

  const scores = scoreAssets(dataset);
  const assetCount = dataset.assets.length;
  const governed = scores.filter((score) => score.governed).length;
  const stars = scores.filter((score) => score.quadrant === "Stars").length;
  const staleCount = scores.filter((score) => score.stale).length;

  const usage = utilizationByAssetWindowed(dataset, window);
  let invocations = 0;
  let errors = 0;
  for (const summary of usage.values()) {
    invocations += summary.invocations;
    errors += summary.errors;
  }

  const byDate = new Map<string, number>();
  for (const row of dataset.utilization) {
    if (!inWindow(row.date, window)) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.invocations);
  }
  const series = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, count]) => count);

  return {
    assetCount,
    governedRate: assetCount ? governed / assetCount : 0,
    effectiveRate: assetCount ? stars / assetCount : 0,
    errorRate: invocations ? errors / invocations : 0,
    staleCount,
    invocations,
    series,
    hasTelemetry: invocations > 0,
  };
}

/**
 * The same TableSignal shape scoped to a single asset, so a Monitor node can
 * light up per asset as a data-shape change rather than a UI rebuild. governedRate
 * becomes that asset's governed score, effectiveRate is 1 when the asset is a Star
 * and 0 otherwise, errorRate comes from its windowed usage, staleCount is 0 or 1,
 * and series is the asset's daily invocation series. Returns null when the id is
 * not in the dataset, mirroring tableSignal's null contract for empty slots.
 */
export function nodeSignal(
  dataset: VaultDataset,
  assetId: string,
  window?: DateWindow,
): TableSignal | null {
  const asset = dataset.assets.find((row) => row.id === assetId);
  if (!asset) return null;

  const score = scoreAsset(asset, dataset);
  const usage = utilizationByAssetWindowed(dataset, window).get(assetId);
  const invocations = usage?.invocations ?? 0;
  const errors = usage?.errors ?? 0;
  const series = dailySeries(dataset, assetId, window);

  return {
    assetCount: 1,
    governedRate: score.governedScore,
    effectiveRate: score.effective ? 1 : 0,
    errorRate: invocations ? errors / invocations : 0,
    staleCount: score.stale ? 1 : 0,
    invocations,
    series,
    hasTelemetry: invocations > 0,
  };
}
