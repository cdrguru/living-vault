import { makeReviewGuard } from "@/dashboard/access";
import type { DataSource } from "./DataSource";
import { RayfinDataSource } from "./RayfinDataSource";
import { createRayfinReader } from "./rayfinReader";
import { createRayfinWriter } from "./rayfinWriter";
import { SeedDataSource } from "./SeedDataSource";

export type { DataSource, UnattributedUsage } from "./DataSource";
export { SeedDataSource } from "./SeedDataSource";
export { RayfinDataSource } from "./RayfinDataSource";
export { entitiesToDataset } from "./rayfinMapper";
export type { RayfinEntities } from "./rayfinMapper";
export { seedDataset } from "./seed";
export { realAssetsProjection, realAssetId } from "./realAssets";
export { importDelta, mergeProjection } from "./merge";
export type { ImportResult, ProjectionInput } from "./merge";
export { fabricLibraryProjection } from "./projection";
export { telemetrySnapshot } from "./telemetrySnapshot";
export type { TelemetrySnapshot } from "./telemetrySnapshot";
export { hasOnlyProbeTelemetry, isProbeUtilization } from "./telemetryProbe";
export { harnessUsageSnapshot } from "./harnessUsage";
export { codexBillingSnapshot } from "./codexBilling";
export { codexWorkspaceUsageSnapshot } from "./codexWorkspaceUsage";
export {
  pricing,
  modelRate,
  harnessSpend,
  harnessSpendTotals,
} from "./harnessCost";
export type {
  Pricing,
  HarnessSpend,
  HarnessSpendTotals,
  ModelSpend,
} from "./harnessCost";
export * from "./metrics";
export {
  assetInterventionEffect,
  type InterventionEffectView,
} from "./interventionEffect";
export type { Verdict, VerdictResult } from "./verdict";
export { compareCodexBilling, selectCostBasis } from "./costBasis";
export type {
  CodexBillingComparison,
  CostBasis,
  CostBasisResult,
} from "./costBasis";
export type * from "./types";

/**
 * The data source seam. Defaults to the zero-cost seed source. Set
 * VITE_RAYFIN_DATA=true to read and write a live Fabric backend through
 * RayfinDataSource. (This is the public build of this file: the self-host
 * LocalServerDataSource branch exists only in the private repo.)
 */
export function createDataSource(): DataSource {
  if (import.meta.env.VITE_RAYFIN_DATA === "true") {
    const reader = createRayfinReader();
    // Review gate (RBAC option C): DAB has no maintainer role, so the maintainer/
    // admin check is enforced app-side here. On each review action, resolve the
    // Fabric session user's email against the catalog owners. The auth bootstrap is
    // imported dynamically so the seed/demo path never pulls it into this branch.
    const canReview = makeReviewGuard(async () => {
      const { bootstrapAuth } = await import("@/services/bootstrap");
      const [user, entities] = await Promise.all([
        bootstrapAuth().then((auth) => auth.getCurrentUser()),
        reader.readAll(),
      ]);
      return { email: user?.email, owners: entities.owners };
    });
    return new RayfinDataSource(reader, createRayfinWriter(), { canReview });
  }
  return new SeedDataSource();
}
