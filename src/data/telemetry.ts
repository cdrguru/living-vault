import type { TelemetryMeta, UtilizationRow, VaultDataset } from './types';

/**
 * Replace the dataset's utilization with real telemetry rows. Pure: returns a
 * new dataset and does not mutate the input. Rows whose assetId is not present
 * in the dataset are dropped so the coherence contract holds regardless of
 * import order. Duplicate rows sharing the same id are deduped, keeping the
 * last occurrence. Real telemetry supersedes the synthetic seed utilization.
 */
export function applyTelemetry(
  current: VaultDataset,
  rows: UtilizationRow[],
  meta: TelemetryMeta
): VaultDataset {
  const assetIds = new Set(current.assets.map((asset) => asset.id));
  const byId = new Map<string, UtilizationRow>();
  for (const row of rows) {
    if (assetIds.has(row.assetId)) byId.set(row.id, row);
  }
  return { ...current, utilization: [...byId.values()], telemetryMeta: meta };
}
