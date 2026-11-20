import type { VaultDataset } from "./types";

/**
 * The reference "today" for age, taken from the data rather than the wall clock so a
 * worklist is reproducible from its inputs (this is how the rest of metrics.ts treats
 * time).
 *
 * It is the newest timestamp ANY input carries: the latest telemetry date, the latest
 * source mtime, or the latest asset updatedAt. All three matter. Deriving it from
 * telemetry alone anchored "now" to an asset's own date whenever a dataset had no
 * telemetry, which made every age zero and silently disabled every age-based rule,
 * including retire.
 *
 * Lives in its own module so the public build can use it without the ranking code.
 */
export function referenceDate(
  dataset: VaultDataset,
  sources: Map<string, { modifiedAt?: string }> = new Map(),
): number {
  let newest = 0;
  const consider = (value: string | undefined) => {
    if (!value) return;
    const t = Date.parse(value);
    if (Number.isFinite(t) && t > newest) newest = t;
  };
  for (const row of dataset.utilization) consider(row.date);
  for (const source of sources.values()) consider(source.modifiedAt);
  for (const asset of dataset.assets) consider(asset.updatedAt);
  return newest;
}
