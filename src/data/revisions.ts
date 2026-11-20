import type {
  AssetRevisionRow,
  AssetRevisionSource,
  AssetRow,
  VaultDataset,
} from "./types";

/**
 * Revision reconciliation: make sure every asset's CURRENT content is captured as an
 * immutable AssetRevision row, minting one where it is not.
 *
 * The design is reconcile-after-write rather than mint-before-write, and that choice is
 * what keeps this small. Every mutation path in every data source funnels a candidate
 * dataset through a chokepoint (SeedDataSource.commit, ServerVaultService.gate,
 * mergeProjection for the import paths), so one idempotent pass over the result covers
 * addAsset, updateAsset, importProjection, an accepted submission, and the localStorage
 * load-migration, without any per-writer minting logic to keep in sync.
 *
 * Pure and clockless: a minted revision's createdAt is the asset's updatedAt, which the
 * mutation itself already stamped. Idempotent: an asset whose latest revision already
 * matches its contentHash mints nothing, so running the pass twice is running it once.
 *
 * Two deliberate non-behaviors:
 * - Nothing here ever edits or removes an existing revision. History only grows.
 * - The contract does NOT require revision parity (see contract.ts). Parity is this
 *   module's job at the chokepoints; making it a contract violation would brick any
 *   caller that assembles a candidate without running this first.
 */

/**
 * Deterministic revision id. Derived from (assetId, seq) rather than random so that
 * minting stays pure (mergeProjection and composeSeedDataset must be reproducible) and
 * re-running a reconcile cannot mint a colliding duplicate. The Fabric write path is
 * the exception: its ids must be real UUIDs, so RayfinDataSource passes its own mkId.
 */
export const revisionId = (assetId: string, seq: number): string =>
  `rev-${assetId}-${seq}`;

export interface MintOptions {
  /** Who is minting (for example "seed", "local-user", "self-host", "migration"). */
  actor: string;
  source: AssetRevisionSource;
  /** Override the deterministic id scheme (the Fabric path needs real UUIDs). */
  mkId?: (assetId: string, seq: number) => string;
}

/** All of one asset's revisions, oldest (lowest seq) first. */
export function revisionHistory(
  revisions: AssetRevisionRow[],
  assetId: string,
): AssetRevisionRow[] {
  return revisions
    .filter((row) => row.assetId === assetId)
    .sort((a, b) => a.seq - b.seq);
}

/** The newest revision per asset (highest seq), or absent when an asset has none. */
export function latestRevisionByAsset(
  revisions: AssetRevisionRow[],
): Map<string, AssetRevisionRow> {
  const latest = new Map<string, AssetRevisionRow>();
  for (const row of revisions) {
    const current = latest.get(row.assetId);
    if (!current || row.seq > current.seq) latest.set(row.assetId, row);
  }
  return latest;
}

/**
 * The revision holding an asset's CURRENT content, or null when none matches.
 *
 * Derived, not stored: the newest revision whose contentHash equals the asset's. After
 * a reconcile this is simply the highest seq; it is null only on a dataset that never
 * passed through ensureRevisions (for example a hand-built test fixture).
 */
export function currentRevisionOf(
  asset: AssetRow,
  revisions: AssetRevisionRow[],
): AssetRevisionRow | null {
  const history = revisionHistory(revisions, asset.id);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].contentHash === asset.contentHash) return history[i];
  }
  return null;
}

/** Mint the next revision for an asset from its current content. Pure. */
function mintFrom(
  asset: AssetRow,
  seq: number,
  options: MintOptions,
): AssetRevisionRow {
  const mkId = options.mkId ?? revisionId;
  return {
    id: mkId(asset.id, seq),
    tenantId: asset.tenantId,
    assetId: asset.id,
    seq,
    body: asset.body,
    contentHash: asset.contentHash,
    createdAt: asset.updatedAt,
    createdByActor: options.actor,
    source: options.source,
  };
}

/**
 * Reconcile a dataset's revisions against its assets and return a new dataset.
 *
 * For each asset: no revisions at all mints seq 1 from the current content; a latest
 * revision whose contentHash differs from the asset's mints latest.seq + 1. A latest
 * revision that already matches mints nothing. A re-appearing older hash (a revert)
 * correctly mints a NEW revision rather than reusing the old row: history records that
 * the content changed back, it does not pretend the change never happened.
 *
 * Existing revisions are carried through untouched, dangling or not; pruning history is
 * deleteAsset's job, never this function's.
 */
export function ensureRevisions(
  dataset: VaultDataset,
  options: MintOptions,
): VaultDataset {
  const latest = latestRevisionByAsset(dataset.assetRevisions);
  const minted: AssetRevisionRow[] = [];
  for (const asset of dataset.assets) {
    const last = latest.get(asset.id);
    if (!last) {
      minted.push(mintFrom(asset, 1, options));
    } else if (last.contentHash !== asset.contentHash) {
      minted.push(mintFrom(asset, last.seq + 1, options));
    }
  }
  if (minted.length === 0) return dataset;
  return {
    ...dataset,
    assetRevisions: [...dataset.assetRevisions, ...minted],
  };
}
