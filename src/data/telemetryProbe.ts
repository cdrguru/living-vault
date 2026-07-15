import type { TelemetryMeta, UtilizationRow } from "./types";

/**
 * Probe-seeded telemetry is synthetic: scripts/vault-telemetry-probe.mjs gives
 * each overlay asset with no real usage exactly one invocation on meta.probeDate
 * so the catalog can prove every asset resolves through the pipeline. These pure
 * helpers let the UI tell that synthetic single call apart from live Claude Code
 * usage. They no-op (return false) on any snapshot without probe metadata, so the
 * committed demo and any pre-probe snapshot read as all-live.
 */

/**
 * True when this row is the synthetic probe row for `assetId`: a single
 * invocation on the probe date for an asset the probe seeded.
 */
export function isProbeUtilization(
  assetId: string,
  row: UtilizationRow,
  meta?: TelemetryMeta,
): boolean {
  if (!meta?.probeAssetIds || !meta.probeDate) return false;
  return (
    row.date === meta.probeDate &&
    row.invocations === 1 &&
    meta.probeAssetIds.includes(assetId)
  );
}

/**
 * True when every utilization row for `assetId` is a probe row, so the asset has
 * no live usage at all. False when the asset has any real row, has no rows, or the
 * snapshot carries no probe metadata.
 */
export function hasOnlyProbeTelemetry(
  assetId: string,
  utilization: UtilizationRow[],
  meta?: TelemetryMeta,
): boolean {
  if (!meta?.probeAssetIds?.length) return false;
  const rows = utilization.filter((row) => row.assetId === assetId);
  if (rows.length === 0) return false;
  return rows.every((row) => isProbeUtilization(assetId, row, meta));
}
