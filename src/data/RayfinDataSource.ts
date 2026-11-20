import { runDataSourceContract } from "./contract";
import type {
  DataSource,
  EvalImportResult,
  RoutingStatsImportResult,
  SubmissionDetail,
  SubmissionFilter,
  SubmissionItemDecisionInput,
  SubmissionMeta,
  SubmissionReview,
  SubmissionTransitionStatus,
  TelemetryResult,
  UnattributedUsage,
} from "./DataSource";
import type { RecordInterventionInput } from "./DataSource";
import type { InterventionRow } from "./interventions";
import { applyIntervention } from "./recordIntervention";
import { getWindowedHarnessUsage } from "./harnessUsage";
import { contentHashOf } from "./hash";
import {
  importDelta,
  mergeProjection,
  type ImportResult,
  type ProjectionInput,
} from "./merge";
import type { DateWindow } from "./metrics";
import {
  entitiesToDataset,
  indexJoinIds,
  type JoinIdIndex,
  type RayfinEntities,
} from "./rayfinMapper";
import type { RayfinEntityName, RayfinWriter } from "./rayfinWriter";
import {
  applyDecisions,
  assembleAcceptedProjection,
  buildSubmission,
  finalizeSubmission,
} from "./submissions";
import { applyEvals } from "./evals";
import { applyRoutingStats } from "./routingStats";
import { applyTelemetry } from "./telemetry";
import { telemetrySnapshot } from "./telemetrySnapshot";
import type {
  AssetInput,
  AssetRevisionRow,
  AssetRow,
  EvalMeta,
  EvalResultRow,
  RoutingStatRow,
  RoutingStatsMeta,
  HarnessUsage,
  SubmissionItemRow,
  SubmissionRow,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "./types";

/**
 * Reads the catalog entity tables and, optionally, the submission review tables.
 * Injected so the read path is testable. readSubmissions is optional so existing
 * catalog-only reader fakes keep satisfying the interface; a live Fabric reader
 * implements it.
 */
export interface RayfinReader {
  readAll(): Promise<RayfinEntities>;
  readSubmissions?(): Promise<{
    submissions: SubmissionRow[];
    items: SubmissionItemRow[];
  }>;
}

const WRITE_PENDING =
  "RayfinDataSource writes require a live Fabric writer (GraphQL mutations validated against the deployed backend); none is injected, so writes are gated behind an explicit Fabric deploy.";

const SUBMISSIONS_READER_MISSING =
  "This RayfinReader does not implement readSubmissions, so the review queue cannot be read.";

const REVIEW_UNCONFIGURED =
  "Not authorized: no maintainer/admin review guard is configured on this data source. Wire the actor-role guard at deploy.";

const REVIEW_FORBIDDEN = "This action is restricted to maintainers and admins.";

/** Options for the Fabric source: id minting and the review authorization guard. */
export interface RayfinDataSourceOptions {
  /** Mints uuids for new submission, item, and accepted-asset ids. */
  newId?: () => string;
  /** Returns whether the current actor may review (decide/transition). */
  canReview?: () => boolean | Promise<boolean>;
}

/**
 * Tenant id stamped on every row written to Fabric. The `Asset.tenantId` column is
 * `@uuid()`, so the in-memory seed's logical `TENANT` ("tenant-fabricagent") is not
 * a valid value here; this is the canonical Fabric tenant UUID the committed catalog
 * projection already uses. Single-tenant for v1; per-contributor scoping is M5.
 */
export const FABRIC_TENANT_ID = "00000000-0000-0000-0000-00000000fab1";

/**
 * Canonical uuid shape (8-4-4-4-12 hex). Used to tell an upstream/contributed id
 * apart from a real Fabric id: the contribution path mints `contrib-*` / `cc-*`
 * ids, which the `@uuid()` `Asset.id` column rejects on create.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set a foreign key the way the Rayfin GraphQL mutation expects: a relationship
 * object ({ owner: { id } }), which the client converts to the snake_case FK column
 * (owner_id). Passing the raw scalar (ownerId) is silently ignored and leaves the
 * column null. Omitted entirely when the FK is absent (the relationship is optional).
 */
function relationFk(
  columns: Record<string, unknown>,
  relationship: string,
  id: string | undefined,
): void {
  if (id) columns[relationship] = { id };
}

/** Full Asset column payload for a create, converting ISO dates back to Date. */
function assetColumns(
  row: AssetRow,
  includeId: boolean,
): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    tenantId: row.tenantId,
    type: row.type,
    name: row.name,
    slug: row.slug,
    description: row.description,
    system: row.system,
    body: row.body,
    version: row.version,
    status: row.status,
    riskLevel: row.riskLevel,
    maturity: row.maturity,
    tier: row.tier,
    stockVersion: row.stockVersion,
    contentHash: row.contentHash,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  relationFk(columns, "owner", row.ownerId);
  relationFk(columns, "origin", row.originId);
  if (includeId) columns.id = row.id;
  return columns;
}

/** Mutable Asset columns for an update: everything except id, tenantId, createdAt. */
function assetUpdateColumns(row: AssetRow): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    type: row.type,
    name: row.name,
    slug: row.slug,
    description: row.description,
    system: row.system,
    body: row.body,
    version: row.version,
    status: row.status,
    riskLevel: row.riskLevel,
    maturity: row.maturity,
    tier: row.tier,
    stockVersion: row.stockVersion,
    contentHash: row.contentHash,
    updatedAt: new Date(row.updatedAt),
  };
  relationFk(columns, "owner", row.ownerId);
  relationFk(columns, "origin", row.originId);
  return columns;
}

interface RowDiff<T> {
  creates: T[];
  updates: T[];
  deletes: T[];
}

/** Pure reconcile of a current row set to a target set, keyed by `key`. */
function reconcileRows<T>(
  current: T[],
  target: T[],
  key: (row: T) => string,
): RowDiff<T> {
  const currentByKey = new Map(current.map((row) => [key(row), row]));
  const targetByKey = new Map(target.map((row) => [key(row), row]));
  const creates: T[] = [];
  const updates: T[] = [];
  const deletes: T[] = [];
  for (const [k, row] of targetByKey) {
    const existing = currentByKey.get(k);
    if (!existing) creates.push(row);
    else if (JSON.stringify(existing) !== JSON.stringify(row))
      updates.push(row);
  }
  for (const [k, row] of currentByKey) {
    if (!targetByKey.has(k)) deletes.push(row);
  }
  return { creates, updates, deletes };
}

/**
 * Fabric-backed DataSource. The read path maps the nine entities to the same
 * VaultDataset the UI consumes. The write path issues GraphQL mutations through an
 * injected {@link RayfinWriter}, always running the coherence contract on the
 * candidate dataset before any mutation and rejecting the whole operation on a
 * violation (no partial apply). When no writer is injected, writes reject with a
 * clear message, so a read-only Fabric deploy degrades safely. The exact mutation
 * shapes are validated against the live backend at deploy.
 */
export class RayfinDataSource implements DataSource {
  private readonly newId: () => string;
  private readonly canReview?: () => boolean | Promise<boolean>;

  constructor(
    private readonly reader: RayfinReader,
    private readonly writer?: RayfinWriter,
    options: RayfinDataSourceOptions = {},
  ) {
    this.newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    this.canReview = options.canReview;
  }

  private requireWriter(): RayfinWriter {
    if (!this.writer) throw new Error(WRITE_PENDING);
    return this.writer;
  }

  /**
   * App-layer review gate (option C): DAB supports only anonymous/authenticated
   * roles, so a maintainer/admin check cannot live in the entity decorators and is
   * enforced here. Fail closed when no guard is configured.
   */
  private async requireReview(): Promise<void> {
    if (!this.canReview) throw new Error(REVIEW_UNCONFIGURED);
    if (!(await this.canReview())) throw new Error(REVIEW_FORBIDDEN);
  }

  /** Current Fabric data mapped to the UI dataset shape, without the contract gate. */
  private async currentDataset(): Promise<VaultDataset> {
    return entitiesToDataset(await this.reader.readAll());
  }

  /**
   * Current Fabric state for a write: the UI dataset plus the join-row surrogate ids
   * the dataset drops. One backend read serves both. Write paths that delete join rows
   * use this instead of currentDataset, because DAB deletes those rows by primary key.
   */
  private async readState(): Promise<{
    dataset: VaultDataset;
    joinIds: JoinIdIndex;
  }> {
    const entities = await this.reader.readAll();
    return {
      dataset: entitiesToDataset(entities),
      joinIds: indexJoinIds(entities),
    };
  }

  /** Resolve a join row's surrogate primary key for a delete, or fail loudly. */
  private joinIdOrThrow(
    ids: Map<string, string>,
    key: string,
    entity: RayfinEntityName,
  ): string {
    const id = ids.get(key);
    if (!id) {
      throw new Error(`Cannot delete ${entity}: no surrogate id for "${key}".`);
    }
    return id;
  }

  private assertContract(candidate: VaultDataset): void {
    const violations = runDataSourceContract(candidate);
    if (violations.length > 0) {
      throw new Error(`Contract violation: ${violations[0]}`);
    }
  }

  async getDataset(): Promise<VaultDataset> {
    const dataset = await this.currentDataset();
    const violations = runDataSourceContract(dataset);
    if (violations.length > 0) {
      throw new Error(`Contract violation from Fabric data: ${violations[0]}`);
    }
    return dataset;
  }

  reset(): Promise<void> {
    return Promise.reject(
      new Error(
        "Reset is not available against live Fabric data; there is no local copy to discard.",
      ),
    );
  }

  async addAsset(input: AssetInput): Promise<AssetRow> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    const nowIso = new Date().toISOString();
    const pendingId = "__pending_new_asset__";
    const tagIds = input.tagIds ?? [];
    const row: AssetRow = {
      id: pendingId,
      tenantId: FABRIC_TENANT_ID,
      type: input.type,
      name: input.name,
      slug: input.slug,
      description: input.description,
      system: input.system,
      body: input.body,
      version: input.version,
      status: input.status,
      riskLevel: input.riskLevel,
      maturity: input.maturity,
      tier: input.tier,
      stockVersion: input.stockVersion,
      contentHash: contentHashOf(input.type, input.body),
      ownerId: input.ownerId,
      originId: input.originId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const candidate: VaultDataset = {
      ...dataset,
      assets: [...dataset.assets, row],
      assetTags: [
        ...dataset.assetTags,
        ...tagIds.map((tagId) => ({ assetId: pendingId, tagId })),
      ],
    };
    this.assertContract(candidate);
    const created = await writer.create("Asset", assetColumns(row, false));
    for (const tagId of tagIds) {
      await writer.create("AssetTag", {
        assetId: created.id,
        tagId,
        asset: { id: created.id },
        tag: { id: tagId },
      });
    }
    // Capture version 1: every asset's initial content is a revision from birth, so a
    // later edit has a before to compare against.
    await this.createRevision(writer, {
      tenantId: row.tenantId,
      assetId: created.id,
      seq: 1,
      body: row.body,
      contentHash: row.contentHash,
      createdAt: row.updatedAt,
      createdByActor: "fabric-user",
      source: "vault-write",
    });
    return { ...row, id: created.id };
  }

  async updateAsset(id: string, patch: Partial<AssetInput>): Promise<AssetRow> {
    const writer = this.requireWriter();
    const { dataset, joinIds } = await this.readState();
    const current = dataset.assets.find((asset) => asset.id === id);
    if (!current) throw new Error(`Unknown asset "${id}"`);
    const { tagIds, ...assetPatch } = patch;
    const updated: AssetRow = { ...current, ...assetPatch };
    updated.contentHash = contentHashOf(updated.type, updated.body);
    updated.updatedAt = new Date().toISOString();
    let candidate: VaultDataset = {
      ...dataset,
      assets: dataset.assets.map((asset) =>
        asset.id === id ? updated : asset,
      ),
    };
    if (tagIds) {
      candidate = {
        ...candidate,
        assetTags: [
          ...dataset.assetTags.filter((tag) => tag.assetId !== id),
          ...tagIds.map((tagId) => ({ assetId: id, tagId })),
        ],
      };
    }
    this.assertContract(candidate);
    await writer.update("Asset", { id }, assetUpdateColumns(updated));
    // Preserve history when the content changed. Fabric has no SQL migration
    // backfill (rayfin up db apply creates the table empty), so an asset edited
    // before it has any revision gets TWO rows: seq 1 freezes the pre-edit body that
    // would otherwise be destroyed right here, seq 2 records the new one. With prior
    // history, just the next seq.
    if (updated.contentHash !== current.contentHash) {
      const prior = dataset.assetRevisions
        .filter((rev) => rev.assetId === id)
        .reduce((max, rev) => Math.max(max, rev.seq), 0);
      if (prior === 0) {
        await this.createRevision(writer, {
          tenantId: current.tenantId,
          assetId: id,
          seq: 1,
          body: current.body,
          contentHash: current.contentHash,
          createdAt: current.updatedAt,
          createdByActor: "fabric-user",
          source: "import",
        });
      }
      await this.createRevision(writer, {
        tenantId: updated.tenantId,
        assetId: id,
        seq: prior === 0 ? 2 : prior + 1,
        body: updated.body,
        contentHash: updated.contentHash,
        createdAt: updated.updatedAt,
        createdByActor: "fabric-user",
        source: "vault-write",
      });
    }
    if (tagIds) {
      for (const tag of dataset.assetTags.filter((t) => t.assetId === id)) {
        await writer.delete("AssetTag", {
          id: this.joinIdOrThrow(
            joinIds.assetTags,
            `${id}::${tag.tagId}`,
            "AssetTag",
          ),
        });
      }
      for (const tagId of tagIds) {
        await writer.create("AssetTag", {
          assetId: id,
          tagId,
          asset: { id },
          tag: { id: tagId },
        });
      }
    }
    return updated;
  }

  async retireAsset(id: string): Promise<void> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    const current = dataset.assets.find((asset) => asset.id === id);
    if (!current) throw new Error(`Unknown asset "${id}"`);
    const updatedAtIso = new Date().toISOString();
    const candidate: VaultDataset = {
      ...dataset,
      assets: dataset.assets.map((asset): AssetRow =>
        asset.id === id
          ? { ...asset, status: "retired", updatedAt: updatedAtIso }
          : asset,
      ),
    };
    this.assertContract(candidate);
    await writer.update(
      "Asset",
      { id },
      { status: "retired", updatedAt: new Date(updatedAtIso) },
    );
  }

  async deleteAsset(id: string): Promise<void> {
    const writer = this.requireWriter();
    const { dataset, joinIds } = await this.readState();
    const candidate: VaultDataset = {
      ...dataset,
      assets: dataset.assets.filter((asset) => asset.id !== id),
      assetTags: dataset.assetTags.filter((tag) => tag.assetId !== id),
      dependencies: dataset.dependencies.filter(
        (dep) => dep.assetId !== id && dep.dependsOnAssetId !== id,
      ),
      bundleMemberships: dataset.bundleMemberships.filter(
        (membership) => membership.assetId !== id,
      ),
      utilization: dataset.utilization.filter((row) => row.assetId !== id),
      // A deleted asset takes its evidence and its history with it. evalResults was
      // missing from this candidate before revisions arrived, so deleting an
      // eval-bearing asset failed the dangling-eval contract check on the client:
      // the same latent bug as the two local stores, fixed the same day.
      evalResults: dataset.evalResults.filter((row) => row.assetId !== id),
      assetRevisions: dataset.assetRevisions.filter(
        (row) => row.assetId !== id,
      ),
      routingStats: dataset.routingStats.filter((row) => row.assetId !== id),
    };
    this.assertContract(candidate);
    // Fabric has no cascade delete: remove the dependent join and utilization rows
    // first, then the asset, so a mid-cascade failure cannot orphan a parent.
    for (const tag of dataset.assetTags.filter((t) => t.assetId === id)) {
      await writer.delete("AssetTag", {
        id: this.joinIdOrThrow(
          joinIds.assetTags,
          `${id}::${tag.tagId}`,
          "AssetTag",
        ),
      });
    }
    for (const dep of dataset.dependencies.filter(
      (d) => d.assetId === id || d.dependsOnAssetId === id,
    )) {
      await writer.delete("AssetDependency", {
        id: this.joinIdOrThrow(
          joinIds.dependencies,
          `${dep.assetId}::${dep.dependsOnAssetId}`,
          "AssetDependency",
        ),
      });
    }
    for (const membership of dataset.bundleMemberships.filter(
      (b) => b.assetId === id,
    )) {
      await writer.delete("BundleMembership", {
        id: this.joinIdOrThrow(
          joinIds.bundleMemberships,
          `${membership.bundleId}::${id}`,
          "BundleMembership",
        ),
      });
    }
    for (const row of dataset.utilization.filter((u) => u.assetId === id)) {
      await writer.delete("Utilization", { id: row.id });
    }
    for (const row of dataset.evalResults.filter((e) => e.assetId === id)) {
      await writer.delete("EvalResult", { id: row.id });
    }
    for (const row of dataset.routingStats.filter((r) => r.assetId === id)) {
      await writer.delete("RoutingStat", { id: row.id });
    }
    for (const row of dataset.assetRevisions.filter((r) => r.assetId === id)) {
      await writer.delete("AssetRevision", { id: row.id });
    }
    await writer.delete("Asset", { id });
  }

  async importProjection(incoming: ProjectionInput): Promise<ImportResult> {
    const writer = this.requireWriter();
    // A direct catalog merge ("Merge now" / Fabric Library sync) is a privileged
    // write: server-gate it behind the same maintainer/admin guard as the submission
    // review, not just the useActor UI affordance. The "Submit for review" path
    // (submitProjection) stays open to contributors; the accept path already gates via
    // decideSubmission before it reaches here.
    await this.requireReview();
    const { dataset, joinIds } = await this.readState();
    const options = { reconcileByTypeSlug: true };
    // Fabric's Asset.id is @uuid(), so a genuinely new asset arriving with a
    // non-uuid id (the contribution path mints contrib-*/cc- ids) must get a real
    // uuid before any create; the accept path already pre-mints, the upload path
    // did not. Reconciled/updated assets keep their existing id (see mintNewAssetIds).
    const minted = this.mintNewAssetIds(dataset, incoming, options);
    // Dimensions (tag/owner/origin/bundle) are @uuid() too, and the contribution path
    // mints non-uuid ids for them (tag-<slug>, owner-<slug>, ...). Reconcile each onto
    // an existing catalog row by natural key, else mint a uuid, before mergeProjection
    // upserts them by id, so a new dimension is created with a valid id and a duplicate
    // is never made.
    const resolved = this.reconcileDimensions(dataset, minted);
    const delta = importDelta(dataset, resolved, options);
    const merged = mergeProjection(
      dataset,
      resolved,
      FABRIC_TENANT_ID,
      options,
    );
    this.assertContract(merged);
    await this.applyMerge(writer, dataset, merged, joinIds);
    // mergeProjection's ensureRevisions pass minted revision rows for every asset the
    // import created or whose body it changed (and for any asset that predates
    // revision tracking). Revisions are append-only, so the diff is exactly the rows
    // whose (assetId, seq) the live table does not hold yet. Ids are omitted on
    // create (the local rev-* ids are deterministic placeholders; Fabric mints the
    // @uuid() primary key). Written AFTER applyMerge so the referenced assets exist.
    const have = new Set(
      dataset.assetRevisions.map((rev) => `${rev.assetId}::${rev.seq}`),
    );
    for (const rev of merged.assetRevisions) {
      if (have.has(`${rev.assetId}::${rev.seq}`)) continue;
      await this.createRevision(writer, rev);
    }
    return delta;
  }

  /**
   * Create one AssetRevision row. The id is always omitted: Fabric mints the @uuid()
   * primary key, and any locally minted rev-* id is a deterministic placeholder that
   * must not reach a uuid column. Scalar FK plus relationship object, same as every
   * other child-entity create (the scalar satisfies NOT NULL, the relationship keeps
   * the snake_case asset_id column the reader selects populated).
   */
  private async createRevision(
    writer: RayfinWriter,
    rev: Omit<AssetRevisionRow, "id"> & { id?: string },
  ): Promise<void> {
    await writer.create("AssetRevision", {
      tenantId: rev.tenantId,
      assetId: rev.assetId,
      asset: { id: rev.assetId },
      seq: rev.seq,
      body: rev.body,
      contentHash: rev.contentHash,
      createdAt: new Date(rev.createdAt),
      createdByActor: rev.createdByActor,
      source: rev.source,
    });
  }

  /**
   * Rewrite incoming asset ids so a genuinely new asset whose id is not a uuid is
   * assigned a freshly minted uuid, and remap its join references to match. An asset
   * is left untouched when it updates an existing row by id, or (with
   * reconcileByTypeSlug on) when it reconciles onto an existing row by (type, slug):
   * in both cases mergeProjection resolves it onto the existing uuid, so minting
   * would create a duplicate. An already-uuid new id is preserved so an upstream
   * catalog re-import stays idempotent.
   */
  private mintNewAssetIds(
    current: VaultDataset,
    incoming: ProjectionInput,
    options: { reconcileByTypeSlug?: boolean },
  ): ProjectionInput {
    const currentIds = new Set(current.assets.map((asset) => asset.id));
    const currentTypeSlugs = new Set(
      current.assets.map((asset) => `${asset.type}::${asset.slug}`),
    );
    const idRemap = new Map<string, string>();
    const assets = incoming.assets.map((asset) => {
      const reconciles =
        options.reconcileByTypeSlug &&
        currentTypeSlugs.has(`${asset.type}::${asset.slug}`);
      const isNew = !currentIds.has(asset.id) && !reconciles;
      if (isNew && !UUID_RE.test(asset.id)) {
        const id = this.newId();
        idRemap.set(asset.id, id);
        return { ...asset, id };
      }
      return asset;
    });
    if (idRemap.size === 0) return incoming;
    const remap = (id: string): string => idRemap.get(id) ?? id;
    return {
      ...incoming,
      assets,
      assetTags: incoming.assetTags.map((row) => ({
        ...row,
        assetId: remap(row.assetId),
      })),
      dependencies: incoming.dependencies.map((row) => ({
        assetId: remap(row.assetId),
        dependsOnAssetId: remap(row.dependsOnAssetId),
      })),
      bundleMemberships: incoming.bundleMemberships.map((row) => ({
        ...row,
        assetId: remap(row.assetId),
      })),
    };
  }

  /**
   * Resolve the final id of each incoming dimension row of one kind. A row whose id
   * already exists in the catalog is an explicit update by id (left alone). A row whose
   * natural key matches an existing catalog row (or another row already resolved in this
   * same upload) reconciles onto that id and is *dropped*: it references the existing
   * row without overwriting it, so an untrusted contribution can attach to a known
   * tag/owner without renaming it, and an upload that carries the same dimension twice
   * collapses to one. A genuinely new row with a non-uuid id (tag-<slug>, owner-<slug>,
   * ...) is minted a uuid; one already carrying a uuid keeps it (idempotent upstream
   * import). A row whose natural key is empty (e.g. an owner with no email) never
   * reconciles, so distinct keyless rows stay distinct. Returns the changed ids
   * (old -> resolved) and the set of incoming ids to drop from the dimension table.
   */
  private resolveDimension<T extends { id: string }>(
    current: T[],
    incoming: T[],
    naturalKey: (row: T) => string | undefined,
  ): { remap: Map<string, string>; drop: Set<string> } {
    const currentIds = new Set(current.map((row) => row.id));
    const idByNaturalKey = new Map<string, string>();
    for (const row of current) {
      const key = naturalKey(row);
      if (!key) continue;
      const incumbent = idByNaturalKey.get(key);
      // Prefer a real uuid id among natural-key duplicates, else keep the first seen.
      if (
        incumbent === undefined ||
        (!UUID_RE.test(incumbent) && UUID_RE.test(row.id))
      ) {
        idByNaturalKey.set(key, row.id);
      }
    }
    const remap = new Map<string, string>();
    const drop = new Set<string>();
    for (const row of incoming) {
      if (currentIds.has(row.id)) continue;
      const key = naturalKey(row);
      const existing = key ? idByNaturalKey.get(key) : undefined;
      if (existing !== undefined) {
        if (row.id !== existing) remap.set(row.id, existing);
        drop.add(row.id);
      } else if (!UUID_RE.test(row.id)) {
        const minted = this.newId();
        remap.set(row.id, minted);
        if (key) idByNaturalKey.set(key, minted);
      } else if (key) {
        idByNaturalKey.set(key, row.id);
      }
    }
    return { remap, drop };
  }

  /**
   * Rewrite incoming dimension ids (tag/owner/origin/bundle) to their resolved values,
   * drop rows that reconcile onto an existing dimension (so they reference it without
   * overwriting it), and remap every reference to match. applyMerge then creates a new
   * dimension with a uuid and reuses an existing one rather than duplicating it.
   * Natural keys, all case-folded: tag by (kind, name), owner by email, origin by
   * (kind, name), bundle by name. An empty key never reconciles.
   */
  private reconcileDimensions(
    current: VaultDataset,
    incoming: ProjectionInput,
  ): ProjectionInput {
    const norm = (value: string): string | undefined =>
      value.trim().toLowerCase() || undefined;
    const composite = (kind: string, name: string): string | undefined => {
      const n = norm(name);
      return n === undefined ? undefined : `${kind}::${n}`;
    };
    const tag = this.resolveDimension(current.tags, incoming.tags, (t) =>
      composite(t.kind, t.name),
    );
    const owner = this.resolveDimension(current.owners, incoming.owners, (o) =>
      norm(o.email),
    );
    const origin = this.resolveDimension(
      current.origins,
      incoming.origins,
      (o) => composite(o.kind, o.name),
    );
    const bundle = this.resolveDimension(
      current.bundles,
      incoming.bundles,
      (b) => norm(b.name),
    );

    const unchanged = (r: { remap: Map<string, string>; drop: Set<string> }) =>
      r.remap.size === 0 && r.drop.size === 0;
    if (
      unchanged(tag) &&
      unchanged(owner) &&
      unchanged(origin) &&
      unchanged(bundle)
    ) {
      return incoming;
    }

    const apply = (map: Map<string, string>, id: string): string =>
      map.get(id) ?? id;
    const applyOpt = (
      map: Map<string, string>,
      id: string | undefined,
    ): string | undefined =>
      id === undefined ? undefined : (map.get(id) ?? id);
    const keep = <T extends { id: string }>(
      rows: T[],
      res: { remap: Map<string, string>; drop: Set<string> },
    ): T[] =>
      rows
        .filter((row) => !res.drop.has(row.id))
        .map((row) => ({ ...row, id: apply(res.remap, row.id) }));

    return {
      ...incoming,
      tags: keep(incoming.tags, tag),
      owners: keep(incoming.owners, owner),
      origins: keep(incoming.origins, origin),
      bundles: keep(incoming.bundles, bundle),
      assets: incoming.assets.map((row) => ({
        ...row,
        ownerId: applyOpt(owner.remap, row.ownerId),
        originId: applyOpt(origin.remap, row.originId),
      })),
      assetTags: incoming.assetTags.map((row) => ({
        ...row,
        tagId: apply(tag.remap, row.tagId),
      })),
      bundleMemberships: incoming.bundleMemberships.map((row) => ({
        ...row,
        bundleId: apply(bundle.remap, row.bundleId),
      })),
    };
  }

  private async applyMerge(
    writer: RayfinWriter,
    current: VaultDataset,
    target: VaultDataset,
    joinIds: JoinIdIndex,
  ): Promise<void> {
    // FK order matters: dimensions (no FKs) first, then Asset (FK -> Owner/Origin),
    // then the join rows (FK -> Asset and a dimension). Creating an Asset before its
    // Owner/Origin exists would fail to resolve the relationship.
    await this.upsertById(writer, "Tag", current.tags, target.tags);
    await this.upsertById(writer, "Origin", current.origins, target.origins);
    await this.upsertById(writer, "Owner", current.owners, target.owners);
    await this.upsertById(writer, "Bundle", current.bundles, target.bundles);

    // Assets upsert by id. mergeProjection never drops these, so no deletes are
    // issued here; deleteAsset is the explicit removal path.
    const assetDiff = reconcileRows(current.assets, target.assets, (a) => a.id);
    for (const row of assetDiff.creates) {
      await writer.create("Asset", assetColumns(row, true));
    }
    for (const row of assetDiff.updates) {
      await writer.update("Asset", { id: row.id }, assetUpdateColumns(row));
    }

    // Join tables are replaced to match the merged set: add new edges, drop removed.
    // The join entities declare their FK as a *required* @uuid() scalar (assetId,
    // tagId, ...) plus a @one() relationship, so a create must set both: the scalar
    // satisfies the NOT NULL column, the relationship object keeps the snake_case
    // relationship column (asset_id, ...) the reader selects populated. Deletes target
    // the join row's surrogate primary key, resolved from joinIds (the FK columns are
    // not a valid delete filter: DAB point-deletes by `id`).
    await this.syncJoin(
      writer,
      "AssetTag",
      current.assetTags,
      target.assetTags,
      (r) => `${r.assetId}::${r.tagId}`,
      (r) => ({
        assetId: r.assetId,
        tagId: r.tagId,
        asset: { id: r.assetId },
        tag: { id: r.tagId },
      }),
      joinIds.assetTags,
    );
    await this.syncJoin(
      writer,
      "AssetDependency",
      current.dependencies,
      target.dependencies,
      (r) => `${r.assetId}::${r.dependsOnAssetId}`,
      (r) => ({
        assetId: r.assetId,
        dependsOnAssetId: r.dependsOnAssetId,
        asset: { id: r.assetId },
        dependsOn: { id: r.dependsOnAssetId },
      }),
      joinIds.dependencies,
    );
    await this.syncJoin(
      writer,
      "BundleMembership",
      current.bundleMemberships,
      target.bundleMemberships,
      (r) => `${r.bundleId}::${r.assetId}`,
      (r) => ({
        bundleId: r.bundleId,
        assetId: r.assetId,
        bundle: { id: r.bundleId },
        asset: { id: r.assetId },
      }),
      joinIds.bundleMemberships,
    );
  }

  private async upsertById<T extends { id: string }>(
    writer: RayfinWriter,
    entity: RayfinEntityName,
    current: T[],
    target: T[],
  ): Promise<void> {
    const diff = reconcileRows(current, target, (row) => row.id);
    for (const row of diff.creates) {
      await writer.create(entity, { ...row });
    }
    for (const row of diff.updates) {
      const updates: Record<string, unknown> = { ...row };
      delete updates.id;
      await writer.update(entity, { id: row.id }, updates);
    }
  }

  private async syncJoin<T>(
    writer: RayfinWriter,
    entity: RayfinEntityName,
    current: T[],
    target: T[],
    key: (row: T) => string,
    createPayload: (row: T) => Record<string, unknown>,
    ids: Map<string, string>,
  ): Promise<void> {
    const diff = reconcileRows(current, target, key);
    for (const row of diff.creates) {
      await writer.create(entity, createPayload(row));
    }
    for (const row of diff.deletes) {
      // A delete always comes from a current row, which was read with its surrogate
      // id, so the lookup resolves; DAB rejects a delete that omits the primary key.
      await writer.delete(entity, {
        id: this.joinIdOrThrow(ids, key(row), entity),
      });
    }
  }

  async importTelemetry(
    rows: UtilizationRow[],
    meta: TelemetryMeta,
  ): Promise<TelemetryResult> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    // Same destructive-import guard as SeedDataSource: an empty snapshot, or one
    // whose rows reference no known asset, is a no op rather than wiping the table.
    const assetIds = new Set(dataset.assets.map((asset) => asset.id));
    const matched = rows.filter((row) => assetIds.has(row.assetId));
    if (matched.length === 0) {
      return { applied: 0, dropped: rows.length, skipped: "no-matching-rows" };
    }
    const candidate = applyTelemetry(dataset, rows, meta);
    this.assertContract(candidate);
    // applyTelemetry replaces the whole utilization table; mirror that on Fabric by
    // deleting the existing rows, then inserting the new set. The logical upsert key
    // is (assetId, date, model). Utilization.id is @uuid(), but candidate row ids are
    // synthetic dedup keys (claude-code:asset:date:model from normalizeTelemetry, or
    // the seed's own ids), not uuids, so the id is omitted and Fabric mints the primary
    // key. Dedup already happened in applyTelemetry, and nothing references a
    // Utilization by id except this delete, which reads the assigned id back.
    for (const row of dataset.utilization) {
      await writer.delete("Utilization", { id: row.id });
    }
    for (const row of candidate.utilization) {
      await writer.create("Utilization", {
        tenantId: row.tenantId,
        assetId: row.assetId,
        asset: { id: row.assetId },
        date: new Date(row.date),
        invocations: row.invocations,
        successes: row.successes,
        errors: row.errors,
        refusals: row.refusals,
        latencyMs: row.latencyMs,
        tokens: row.tokens,
        cost: row.cost,
        model: row.model,
      });
    }
    return {
      applied: candidate.utilization.length,
      dropped: rows.length - candidate.utilization.length,
    };
  }

  async importEvalResults(
    rows: EvalResultRow[],
    meta: EvalMeta,
  ): Promise<EvalImportResult> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    // Same destructive-import guard as importTelemetry.
    const assetIds = new Set(dataset.assets.map((asset) => asset.id));
    const matched = rows.filter((row) => assetIds.has(row.assetId));
    if (matched.length === 0) {
      return { applied: 0, dropped: rows.length, skipped: "no-matching-rows" };
    }
    const candidate = applyEvals(dataset, rows, meta);
    this.assertContract(candidate);
    // applyEvals replaces the whole eval table; mirror that on Fabric by deleting the
    // existing rows then inserting the new set. Row ids are synthetic (not uuids), so the
    // id is omitted on create and Fabric mints the @uuid() primary key.
    for (const row of dataset.evalResults) {
      await writer.delete("EvalResult", { id: row.id });
    }
    for (const row of candidate.evalResults) {
      await writer.create("EvalResult", {
        tenantId: row.tenantId,
        assetId: row.assetId,
        asset: { id: row.assetId },
        caseHash: row.caseHash,
        date: new Date(row.date),
        trials: row.trials,
        passed: row.passed,
        failed: row.failed,
        errored: row.errored,
        inconclusive: row.inconclusive ?? 0,
        latencyMs: row.latencyMs,
        tokens: row.tokens,
        cost: row.cost,
        model: row.model,
        quality: row.quality,
        // Eval identity (PR12): bare references pass through as-is; a null
        // revision keeps its honest derived cap (applied at read).
        assetRevisionId: row.assetRevisionId ?? undefined,
        harness: row.harness,
        baselineId: row.baselineId ?? undefined,
      });
    }
    return {
      applied: candidate.evalResults.length,
      dropped: rows.length - candidate.evalResults.length,
    };
  }

  async importRoutingStats(
    rows: RoutingStatRow[],
    meta: RoutingStatsMeta,
  ): Promise<RoutingStatsImportResult> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    // Same destructive-import guard as importTelemetry.
    const assetIds = new Set(dataset.assets.map((asset) => asset.id));
    const matched = rows.filter((row) => assetIds.has(row.assetId));
    if (matched.length === 0) {
      return { applied: 0, dropped: rows.length, skipped: "no-matching-rows" };
    }
    const candidate = applyRoutingStats(dataset, rows, meta);
    this.assertContract(candidate);
    // applyRoutingStats replaces the whole routing-stats table; mirror that on Fabric
    // by deleting the existing rows then inserting the new set. Row ids are synthetic
    // (not uuids), so the id is omitted on create and Fabric mints the @uuid() key.
    for (const row of dataset.routingStats) {
      await writer.delete("RoutingStat", { id: row.id });
    }
    for (const row of candidate.routingStats) {
      await writer.create("RoutingStat", {
        tenantId: row.tenantId,
        assetId: row.assetId,
        asset: { id: row.assetId },
        date: new Date(row.date),
        localHits: row.localHits,
        externalFallbacks: row.externalFallbacks,
        belowThreshold: row.belowThreshold,
        externalCost: row.externalCost,
        avoidedCostEstimate: row.avoidedCostEstimate,
      });
    }
    return {
      applied: candidate.routingStats.length,
      dropped: rows.length - candidate.routingStats.length,
    };
  }

  getUnattributedUsage(): UnattributedUsage[] {
    return [...telemetrySnapshot.unattributed].sort(
      (a, b) => b.count - a.count,
    );
  }

  getHarnessUsage(window?: DateWindow): HarnessUsage[] {
    return getWindowedHarnessUsage(window);
  }

  private async readSubmissionStore(): Promise<{
    submissions: SubmissionRow[];
    items: SubmissionItemRow[];
  }> {
    if (!this.reader.readSubmissions) {
      throw new Error(SUBMISSIONS_READER_MISSING);
    }
    return this.reader.readSubmissions();
  }

  async submitProjection(
    incoming: ProjectionInput,
    meta: SubmissionMeta,
  ): Promise<SubmissionRow> {
    const writer = this.requireWriter();
    // Read the catalog (for dedup verdicts) but never write it back; staging only
    // touches the submission tables. Item ids are minted as uuids to satisfy @uuid.
    const catalog = await this.currentDataset();
    const { submission, items } = buildSubmission(catalog, incoming, {
      submissionId: this.newId(),
      tenantId: meta.tenantId ?? FABRIC_TENANT_ID,
      now: new Date().toISOString(),
      submittedByOwnerId: meta.submittedByOwnerId,
      originId: meta.originId,
      note: meta.note,
      mintItemId: () => this.newId(),
    });
    await writer.create("Submission", submissionColumns(submission));
    for (const item of items) {
      await writer.create("SubmissionItem", submissionItemColumns(item));
    }
    return submission;
  }

  async listSubmissions(filter?: SubmissionFilter): Promise<SubmissionRow[]> {
    const { submissions } = await this.readSubmissionStore();
    const matched = filter?.status
      ? submissions.filter((submission) => submission.status === filter.status)
      : submissions;
    return [...matched].sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt),
    );
  }

  async getSubmission(id: string): Promise<SubmissionDetail> {
    const { submissions, items } = await this.readSubmissionStore();
    const submission = submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);
    return {
      submission,
      items: items.filter((item) => item.submissionId === id),
    };
  }

  async decideSubmission(
    id: string,
    decisions: SubmissionItemDecisionInput[],
    review: SubmissionReview,
  ): Promise<ImportResult> {
    const writer = this.requireWriter();
    await this.requireReview();
    const store = await this.readSubmissionStore();
    const submission = store.submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);
    const items = applyDecisions(
      store.items.filter((item) => item.submissionId === id),
      decisions,
    );

    // Accepted items route through importProjection (the contract is the only
    // write gate); new accepted assets get minted uuids. If the import throws, the
    // submission rows are left unwritten below, so a rejected import never leaves a
    // half-finalized review.
    const accepted = items.filter((item) => item.decision === "accept");
    let result: ImportResult = { added: 0, updated: 0 };
    if (accepted.length > 0) {
      result = await this.importProjection(
        assembleAcceptedProjection(
          await this.currentDataset(),
          submission,
          accepted,
          {
            tenantId: FABRIC_TENANT_ID,
            now: new Date().toISOString(),
            mintAssetId: () => this.newId(),
          },
        ),
      );
    }

    const finalized = finalizeSubmission(submission, items, {
      reviewedByOwnerId: review.reviewedByOwnerId,
      reviewedAt: new Date().toISOString(),
      note: review.note,
    });
    await writer.update(
      "Submission",
      { id },
      submissionUpdateColumns(finalized),
    );
    for (const item of items) {
      await writer.update(
        "SubmissionItem",
        { id: item.id },
        { decision: item.decision, reviewerNote: item.reviewerNote },
      );
    }
    return result;
  }

  async transitionSubmission(
    id: string,
    status: SubmissionTransitionStatus,
  ): Promise<SubmissionRow> {
    const writer = this.requireWriter();
    await this.requireReview();
    const { submissions } = await this.readSubmissionStore();
    const submission = submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);
    await writer.update("Submission", { id }, { status });
    return { ...submission, status };
  }

  async recordIntervention(
    input: RecordInterventionInput,
  ): Promise<InterventionRow> {
    const writer = this.requireWriter();
    const dataset = await this.currentDataset();
    const applied = applyIntervention(dataset, input);
    // Append-only: an identical re-record is an idempotent no-op, so nothing is created.
    if (applied.noop) return applied.persisted;
    const candidate: VaultDataset = {
      ...dataset,
      interventions: applied.interventions,
    };
    this.assertContract(candidate);
    const row = applied.persisted;
    await writer.create("Intervention", {
      // id is omitted: Fabric mints the @uuid() primary key. The local uuid is a
      // placeholder for the in-memory candidate only.
      tenantId: row.tenantId,
      assetId: row.assetId,
      revisionIdBefore: row.revisionIdBefore,
      date: new Date(row.date),
      action: row.action,
      outcome: row.outcome,
      actor: row.actor,
      note: row.note,
      effectiveScoreBefore: row.effectiveScoreBefore ?? undefined,
      invocationsBefore: row.invocationsBefore,
      dedupeKey: row.dedupeKey,
      supersedesId: row.supersedesId,
      recordedAt: new Date(row.recordedAt),
    });
    return row;
  }
}

/** Full Submission column payload for a create (dates as Date for the backend). */
function submissionColumns(row: SubmissionRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    submittedByOwnerId: row.submittedByOwnerId,
    originId: row.originId,
    status: row.status,
    itemCount: row.itemCount,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    conflictCount: row.conflictCount,
    contentHash: row.contentHash,
    submittedAt: new Date(row.submittedAt),
    reviewedByOwnerId: row.reviewedByOwnerId,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : undefined,
    note: row.note,
  };
}

/** Mutable Submission columns set when a review is finalized. */
function submissionUpdateColumns(row: SubmissionRow): Record<string, unknown> {
  return {
    status: row.status,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    conflictCount: row.conflictCount,
    reviewedByOwnerId: row.reviewedByOwnerId,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : undefined,
    note: row.note,
  };
}

/** SubmissionItem column payload for a create. tagIds are not persisted (deferred). */
function submissionItemColumns(
  row: SubmissionItemRow,
): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    submissionId: row.submissionId,
    assetName: row.assetName,
    assetType: row.assetType,
    assetSlug: row.assetSlug,
    description: row.description,
    system: row.system,
    body: row.body,
    version: row.version,
    assetStatus: row.assetStatus,
    riskLevel: row.riskLevel,
    maturity: row.maturity,
    tier: row.tier,
    stockVersion: row.stockVersion,
    contentHash: row.contentHash,
    dedupVerdict: row.dedupVerdict,
    duplicateAssetId: row.duplicateAssetId,
    decision: row.decision,
    reviewerNote: row.reviewerNote,
  };
}
