import type { RoutingStatRow, RoutingStatsMeta, VaultDataset } from "./types";

/**
 * Replace the dataset's routing stats with a new set. Pure: returns a new dataset and
 * does not mutate the input. Rows whose assetId is not present in the dataset are dropped
 * so the coherence contract holds regardless of import order. Duplicate rows sharing the
 * same id are deduped, keeping the last occurrence. Mirrors applyEvals (evals.ts) and
 * applyTelemetry (telemetry.ts).
 */
export function applyRoutingStats(
  current: VaultDataset,
  rows: RoutingStatRow[],
  meta: RoutingStatsMeta,
): VaultDataset {
  const assetIds = new Set(current.assets.map((asset) => asset.id));
  const byId = new Map<string, RoutingStatRow>();
  for (const row of rows) {
    if (assetIds.has(row.assetId)) byId.set(row.id, row);
  }
  return { ...current, routingStats: [...byId.values()], routingStatsMeta: meta };
}
