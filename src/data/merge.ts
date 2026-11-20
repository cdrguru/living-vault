import { ensureRevisions } from "./revisions";
import type {
  AssetDependencyRow,
  AssetRow,
  AssetTagRow,
  BundleMembershipRow,
  BundleRow,
  OriginRow,
  OwnerRow,
  TagRow,
  VaultDataset,
} from "./types";

/**
 * A projection is the asset-side half of a VaultDataset, produced upstream by
 * the-fabric-library (cdrguru/the-fabric-library): its scripts/vault-project.py
 * projects that repo's catalog.yaml into this shape, and the result is committed
 * here as src/data/imports/fabric-library.json. It carries everything except
 * Utilization: the vault owns effectiveness telemetry and never receives it from
 * an import, so it is preserved across every merge.
 */
export interface ProjectionInput {
  assets: AssetRow[];
  tags: TagRow[];
  origins: OriginRow[];
  owners: OwnerRow[];
  bundles: BundleRow[];
  assetTags: AssetTagRow[];
  dependencies: AssetDependencyRow[];
  bundleMemberships: BundleMembershipRow[];
}

export interface ImportResult {
  added: number;
  updated: number;
}

/** Composite-key separator for join rows. Ids never contain this token. */
const KEY_SEP = "::";

/**
 * Id prefix of the real-assets overlay (`cc-<type>-<slug>`, see realAssets.ts).
 * Overlay ids are the ones telemetry attributes to, so when several current assets
 * share a (type, slug) the reconcile target prefers an overlay id over a stock seed
 * id. This keeps the choice deterministic rather than dependent on array order.
 */
const OVERLAY_ID_PREFIX = "cc-";

function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

function upsertById<T extends { id: string; tenantId: string }>(
  current: T[],
  incoming: T[],
  tenantId: string,
): T[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    byId.set(row.id, { ...row, tenantId });
  }
  return [...byId.values()];
}

/**
 * Options shared by importDelta and mergeProjection.
 */
export interface MergeOptions {
  /**
   * When true, an incoming asset with no id match is reconciled onto an existing
   * asset that shares its (type, slug). The Fabric-library sync turns this on so
   * it enriches existing catalog rows instead of adding duplicate entries: the
   * snapshot keys assets by uuid5 while the real-assets overlay keys the same
   * skills by `cc-<type>-<slug>`, so an id-only merge would list each twice.
   *
   * Off by default, because seed composition intentionally keeps a stock seed
   * asset and the owner's real overlay asset under the same slug as separate rows;
   * collapsing them there would move a real asset onto a seed id and break the
   * telemetry that attributes to the `cc-` id.
   */
  reconcileByTypeSlug?: boolean;
}

/**
 * Resolve each incoming asset to the dataset id it should occupy: its own id if
 * that id already exists, otherwise (when reconcileByTypeSlug is on) an existing
 * asset that shares its (type, slug) under a different id, otherwise its own id
 * (a genuinely new asset).
 *
 * When several existing assets share a (type, slug), the telemetry-bearing overlay
 * id (OVERLAY_ID_PREFIX) wins over a stock seed id. The choice is independent of
 * array order, so reconciliation stays correct even if a colliding slug is added
 * later or the assets array is persisted in a different order.
 */
function resolveIncomingIds(
  current: { assets: AssetRow[] },
  incoming: ProjectionInput,
  options: MergeOptions = {},
): Map<string, string> {
  const currentIds = new Set(current.assets.map((asset) => asset.id));
  const idByTypeSlug = new Map<string, string>();
  if (options.reconcileByTypeSlug) {
    for (const asset of current.assets) {
      const key = `${asset.type}${KEY_SEP}${asset.slug}`;
      const incumbent = idByTypeSlug.get(key);
      // Prefer an overlay id; otherwise keep the first one seen (deterministic).
      const preferIncoming =
        incumbent === undefined ||
        (!incumbent.startsWith(OVERLAY_ID_PREFIX) &&
          asset.id.startsWith(OVERLAY_ID_PREFIX));
      if (preferIncoming) idByTypeSlug.set(key, asset.id);
    }
  }
  const remap = new Map<string, string>();
  for (const asset of incoming.assets) {
    if (currentIds.has(asset.id)) {
      remap.set(asset.id, asset.id);
      continue;
    }
    const match = idByTypeSlug.get(`${asset.type}${KEY_SEP}${asset.slug}`);
    remap.set(asset.id, match ?? asset.id);
  }
  return remap;
}

/**
 * Count how many catalog rows an import would add versus update. Counts distinct
 * resolved ids, not raw incoming assets, so two incoming assets that reconcile onto
 * one row report a single update rather than over-counting.
 */
export function importDelta(
  current: VaultDataset,
  incoming: ProjectionInput,
  options: MergeOptions = {},
): ImportResult {
  const currentIds = new Set(current.assets.map((asset) => asset.id));
  const remap = resolveIncomingIds(current, incoming, options);
  const resolvedIds = new Set(
    incoming.assets.map((asset) => remap.get(asset.id) ?? asset.id),
  );
  let added = 0;
  let updated = 0;
  for (const id of resolvedIds) {
    if (currentIds.has(id)) updated += 1;
    else added += 1;
  }
  return { added, updated };
}

/**
 * Merge an upstream projection into the current dataset and return a new dataset.
 *
 * Pure: it does not mutate either argument. Behavior:
 * - assets/tags/origins/owners/bundles upsert by id; incoming rows are normalized
 *   to the supplied tenantId. An existing asset keeps its original createdAt.
 * - join rows (assetTags, dependencies, bundleMemberships) are replaced for the
 *   imported scope: rows referencing an imported asset (or, for memberships, an
 *   imported bundle) are dropped and the incoming rows added, so re-importing is
 *   idempotent and removals propagate.
 * - utilization is carried over from current untouched.
 *
 * Rows that belong only to the current dataset (for example seed assets that share
 * no (type, slug) with the projection) are left exactly as they were. With
 * reconcileByTypeSlug on, incoming assets that match an existing (type, slug) under
 * a different id are reconciled onto the existing row (see resolveIncomingIds), and
 * their join rows are remapped to the resolved id so nothing dangles.
 */
export function mergeProjection(
  current: VaultDataset,
  incoming: ProjectionInput,
  tenantId: string,
  options: MergeOptions = {},
): VaultDataset {
  const remap = resolveIncomingIds(current, incoming, options);
  const resolve = (id: string): string => remap.get(id) ?? id;

  const currentAssetsById = new Map(
    current.assets.map((asset) => [asset.id, asset]),
  );
  const mergedAssetsById = new Map(currentAssetsById);
  for (const asset of incoming.assets) {
    const id = resolve(asset.id);
    const existing = currentAssetsById.get(id);
    mergedAssetsById.set(id, {
      ...asset,
      id,
      tenantId,
      createdAt: existing ? existing.createdAt : asset.createdAt,
    });
  }
  const assets = [...mergedAssetsById.values()];

  const tags = upsertById(current.tags, incoming.tags, tenantId);
  const origins = upsertById(current.origins, incoming.origins, tenantId);
  const owners = upsertById(current.owners, incoming.owners, tenantId);
  const bundles = upsertById(current.bundles, incoming.bundles, tenantId);

  const importedAssetIds = new Set(
    incoming.assets.map((asset) => resolve(asset.id)),
  );
  const importedBundleIds = new Set(
    incoming.bundles.map((bundle) => bundle.id),
  );

  const assetTags = dedupeBy(
    [
      ...current.assetTags.filter((row) => !importedAssetIds.has(row.assetId)),
      ...incoming.assetTags.map((row) => ({
        ...row,
        assetId: resolve(row.assetId),
      })),
    ],
    (row) => `${row.assetId}${KEY_SEP}${row.tagId}`,
  );

  const dependencies = dedupeBy(
    [
      ...current.dependencies.filter(
        (row) => !importedAssetIds.has(row.assetId),
      ),
      ...incoming.dependencies.map((row) => ({
        assetId: resolve(row.assetId),
        dependsOnAssetId: resolve(row.dependsOnAssetId),
      })),
    ],
    (row) => `${row.assetId}${KEY_SEP}${row.dependsOnAssetId}`,
  );

  const bundleMemberships = dedupeBy(
    [
      ...current.bundleMemberships.filter(
        (row) => !importedBundleIds.has(row.bundleId),
      ),
      ...incoming.bundleMemberships.map((row) => ({
        ...row,
        assetId: resolve(row.assetId),
      })),
    ],
    (row) => `${row.bundleId}${KEY_SEP}${row.assetId}`,
  );

  // Reconcile revision history over the merged result. This is the observed-scan
  // seam: a real edit happens in the practitioner's own files, arrives here as a
  // changed contentHash on the next import, and the version it replaced is already
  // in assetRevisions from the previous reconcile. Running over the WHOLE merged
  // dataset (not just incoming rows) also heals current-side assets that predate
  // revision tracking, which is what makes every import path in every data source a
  // self-migrating one. Idempotent, so re-importing the same projection mints nothing.
  return ensureRevisions(
    {
      assets,
      tags,
      origins,
      owners,
      bundles,
      assetTags,
      dependencies,
      bundleMemberships,
      assetRevisions: current.assetRevisions,
      utilization: current.utilization,
      evalResults: current.evalResults,
      // Baselines are named comparison targets preserved verbatim; a projection
      // never carries them, like the intervention log below.
      baselines: current.baselines,
      // Interventions are an append-only log preserved verbatim across an import; a
      // projection never carries them.
      interventions: current.interventions,
      // Routing stats are router evidence preserved verbatim across an import; a
      // projection never carries them.
      routingStats: current.routingStats,
      telemetryMeta: current.telemetryMeta,
      evalMeta: current.evalMeta,
      routingStatsMeta: current.routingStatsMeta,
    },
    { actor: "projection-import", source: "observed-scan" },
  );
}
