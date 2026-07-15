import { contentHashOf } from "./hash";
import type { AssetRow, VaultDataset } from "./types";

export function assetCoherenceViolations(assets: AssetRow[]): string[] {
  const violations: string[] = [];
  for (const asset of assets) {
    if (asset.tier === "forked" && !asset.stockVersion) {
      violations.push(`${asset.id}: forked assets require stockVersion`);
    }
    if (asset.tier === "stock" && asset.stockVersion) {
      violations.push(`${asset.id}: stock assets cannot carry stockVersion`);
    }
    if (asset.maturity < 0 || asset.maturity > 1) {
      violations.push(`${asset.id}: maturity out of range`);
    }
    if (asset.contentHash !== contentHashOf(asset.type, asset.body)) {
      violations.push(`${asset.id}: contentHash does not match type and body`);
    }
  }
  return violations;
}

export function referentialIntegrityViolations(
  dataset: VaultDataset,
): string[] {
  const assetIds = new Set(dataset.assets.map((asset) => asset.id));
  const tagIds = new Set(dataset.tags.map((tag) => tag.id));
  const ownerIds = new Set(dataset.owners.map((owner) => owner.id));
  const originIds = new Set(dataset.origins.map((origin) => origin.id));
  const bundleIds = new Set(dataset.bundles.map((bundle) => bundle.id));
  const violations: string[] = [];

  for (const asset of dataset.assets) {
    if (asset.ownerId && !ownerIds.has(asset.ownerId)) {
      violations.push(`${asset.id}: unknown ownerId`);
    }
    if (asset.originId && !originIds.has(asset.originId)) {
      violations.push(`${asset.id}: unknown originId`);
    }
  }
  for (const row of dataset.assetTags) {
    if (!assetIds.has(row.assetId))
      violations.push(`${row.assetId}: dangling assetTag asset`);
    if (!tagIds.has(row.tagId))
      violations.push(`${row.tagId}: dangling assetTag tag`);
  }
  for (const row of dataset.dependencies) {
    if (!assetIds.has(row.assetId))
      violations.push(`${row.assetId}: dangling dependency source`);
    if (!assetIds.has(row.dependsOnAssetId)) {
      violations.push(`${row.dependsOnAssetId}: dangling dependency target`);
    }
  }
  for (const row of dataset.bundleMemberships) {
    if (!bundleIds.has(row.bundleId))
      violations.push(`${row.bundleId}: dangling bundle`);
    if (!assetIds.has(row.assetId))
      violations.push(`${row.assetId}: dangling bundle asset`);
  }
  for (const row of dataset.utilization) {
    if (!assetIds.has(row.assetId))
      violations.push(`${row.assetId}: dangling utilization asset`);
    if (row.successes + row.errors + row.refusals > row.invocations) {
      violations.push(`${row.id}: utilization outcomes exceed invocations`);
    }
  }
  for (const row of dataset.evalResults) {
    if (!assetIds.has(row.assetId)) {
      violations.push(`${row.assetId}: dangling eval-result asset`);
    }
    if (row.passed + row.failed + row.errored > row.trials) {
      violations.push(`${row.id}: eval outcomes exceed trials`);
    }
  }
  return violations;
}

export function runDataSourceContract(dataset: VaultDataset): string[] {
  return [
    ...assetCoherenceViolations(dataset.assets),
    ...referentialIntegrityViolations(dataset),
  ];
}
