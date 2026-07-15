import type { EvalMeta, EvalResultRow, VaultDataset } from "./types";

/**
 * Replace the dataset's eval results with a new set. Pure: returns a new dataset and does
 * not mutate the input. Rows whose assetId is not present in the dataset are dropped so the
 * coherence contract holds regardless of import order. Duplicate rows sharing the same id
 * are deduped, keeping the last occurrence. Mirrors applyTelemetry (telemetry.ts).
 */
export function applyEvals(
  current: VaultDataset,
  rows: EvalResultRow[],
  meta: EvalMeta,
): VaultDataset {
  const assetIds = new Set(current.assets.map((asset) => asset.id));
  const byId = new Map<string, EvalResultRow>();
  for (const row of rows) {
    if (assetIds.has(row.assetId)) byId.set(row.id, row);
  }
  return { ...current, evalResults: [...byId.values()], evalMeta: meta };
}
