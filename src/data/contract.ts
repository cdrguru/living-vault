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
    // inconclusive joined the outcome buckets in PR12; pre-identity rows carry
    // 0 (absent reads as 0), so the rule is strictly tighter, never looser.
    // assetRevisionId/baselineId are deliberately NOT checked for dangling: they
    // are durable bare references whose honesty consequence (the derived cap in
    // evalRowHonesty) is the enforcement, not a contract violation.
    if (
      row.passed + row.failed + row.errored + (row.inconclusive ?? 0) >
      row.trials
    ) {
      violations.push(`${row.id}: eval outcomes exceed trials`);
    }
  }
  for (const row of dataset.routingStats) {
    if (!assetIds.has(row.assetId)) {
      violations.push(`${row.assetId}: dangling routing-stat asset`);
    }
    // A routing decision count or a cost cannot be negative; a negative value is
    // an importer bug, not a measurement. avoidedCostEstimate is modeled and its
    // honesty lives in RoutingStatsMeta.tracked, not here.
    if (
      row.localHits < 0 ||
      row.externalFallbacks < 0 ||
      row.belowThreshold < 0 ||
      row.externalCost < 0 ||
      row.avoidedCostEstimate < 0
    ) {
      violations.push(`${row.id}: negative routing-stat value`);
    }
  }
  // Revisions: integrity of the rows that exist, never parity with the assets.
  // Requiring "every asset has a current revision" here would brick any caller that
  // assembles a candidate before ensureRevisions runs; parity is the chokepoints' job
  // (SeedDataSource.commit, ServerVaultService.gate, mergeProjection). What IS
  // enforced: a revision must belong to a live asset, seq must be a positive version
  // counter, and (assetId, seq) must be unique, because two rows claiming to be the
  // same version of the same asset is a corrupted history no later comparison can
  // read. Note there is deliberately no contentHash-vs-body recheck: the hash is
  // computed with the asset's TYPE, and an asset whose type was later patched would
  // fail a recheck of perfectly honest historical rows.
  const revisionSeqs = new Set<string>();
  for (const row of dataset.assetRevisions) {
    if (!assetIds.has(row.assetId)) {
      violations.push(`${row.assetId}: dangling asset-revision asset`);
    }
    if (!Number.isInteger(row.seq) || row.seq < 1) {
      violations.push(`${row.id}: revision seq must be a positive integer`);
    }
    const key = `${row.assetId}#${row.seq}`;
    if (revisionSeqs.has(key)) {
      violations.push(`${row.id}: duplicate revision seq for asset`);
    }
    revisionSeqs.add(key);
  }
  return violations;
}

export function runDataSourceContract(dataset: VaultDataset): string[] {
  return [
    ...assetCoherenceViolations(dataset.assets),
    ...referentialIntegrityViolations(dataset),
  ];
}
