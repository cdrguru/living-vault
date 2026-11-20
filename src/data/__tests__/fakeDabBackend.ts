import type { RayfinReader } from "@/data/RayfinDataSource";
import type { RayfinEntities } from "@/data/rayfinMapper";
import type { RayfinEntityName, RayfinWriter } from "@/data/rayfinWriter";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Relationship property -> snake_case FK column, mirroring how the real Rayfin
 * client converts a `{ owner: { id } }` create payload to the `owner_id` column.
 * Modeling this in the fake is what makes the tests catch a writer that sends
 * the raw camelCase scalar (ownerId) instead of the relationship object.
 */
export const RELATION_FK: Record<string, string> = {
  owner: "owner_id",
  origin: "origin_id",
  asset: "asset_id",
  tag: "tag_id",
  dependsOn: "dependsOn_id",
  bundle: "bundle_id",
};

/** Flatten relationship objects ({ owner: { id } }) to snake_case FK columns. */
export function toColumns(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const fk = RELATION_FK[key];
    if (fk && value && typeof value === "object" && "id" in value) {
      columns[fk] = (value as { id: unknown }).id;
    } else {
      columns[key] = value;
    }
  }
  return columns;
}

/** Matches a stored row against an equality filter (every key must match). */
function matchesEveryKey(
  row: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

export interface FakeDabBackendOptions {
  /**
   * Required NOT NULL scalar foreign keys per entity, mirroring the deployed
   * schema: the join entities and Utilization declare their FK as a required
   * `@uuid()` scalar (assetId, tagId, ...), so a create that omits it fails
   * the same way the live backend did. This is what makes a test catch a
   * writer that sets only the `@one()` relationship object and not the
   * required scalar.
   */
  requiredScalarFks?: Partial<Record<RayfinEntityName, string[]>>;
  /**
   * Entities whose create enforces the live Fabric `@uuid()` constraint on a
   * client-supplied id: a create whose id is present but not a uuid rejects
   * with the exact GraphQL error the live backend returns. Pass "all" to
   * enforce the constraint on every entity; an omitted list enforces nothing.
   */
  uuidRejectTables?: RayfinEntityName[] | "all";
  /**
   * Shape of the id minted when create receives no id. "uuid" (the default)
   * mints a server-style uuid, as the deployed backend does; "gen" mints a
   * non-uuid `gen-<n>` marker.
   */
  mintShape?: "uuid" | "gen";
  /**
   * update/delete filter semantics:
   * - "all-keys" (the default): a row matches when every filter key matches.
   * - "id-only": a row matches only on `row.id === filter.id`.
   * - "id-required": like "id-only", but a filter with no `id` rejects with
   *   the exact GraphQL error the live backend returns. This is the
   *   live-backend-faithful variant: every DAB-generated point mutation
   *   (`update<Entity>` / `delete<Entity>`) is keyed strictly on the primary
   *   key argument `id`.
   */
  filterMode?: "all-keys" | "id-only" | "id-required";
}

/**
 * An in-memory DAB backend fake that is both reader and writer over one
 * mutable RayfinEntities store, so a write mutates the store and a subsequent
 * readAll reflects it. Mirrors the live client surface RayfinDataSource
 * depends on; the options select which live-backend constraints the fake
 * enforces.
 */
export class FakeDabBackend implements RayfinReader, RayfinWriter {
  store: RayfinEntities;
  private counter = 0;
  private readonly options: FakeDabBackendOptions;

  constructor(initial: RayfinEntities, options: FakeDabBackendOptions = {}) {
    this.store = structuredClone(initial);
    this.options = options;
  }

  readAll(): Promise<RayfinEntities> {
    return Promise.resolve(structuredClone(this.store));
  }

  private table(entity: RayfinEntityName): Record<string, unknown>[] {
    const tables: Record<RayfinEntityName, unknown[]> = {
      Asset: this.store.assets,
      Tag: this.store.tags,
      Origin: this.store.origins,
      Owner: this.store.owners,
      Bundle: this.store.bundles,
      AssetTag: this.store.assetTags,
      AssetDependency: this.store.dependencies,
      BundleMembership: this.store.bundleMemberships,
      Utilization: this.store.utilization,
      RoutingStat: this.store.routingStats,
      EvalResult: this.store.evalResults,
      AssetRevision: this.store.assetRevisions,
      Intervention: this.store.interventions,
      // This catalog-only fake does not exercise the submission tables.
      Submission: [],
      SubmissionItem: [],
    };
    return tables[entity] as Record<string, unknown>[];
  }

  private rejectsNonUuidId(entity: RayfinEntityName): boolean {
    const tables = this.options.uuidRejectTables;
    return tables === "all" ? true : (tables?.includes(entity) ?? false);
  }

  private mintId(): string {
    this.counter += 1;
    return this.options.mintShape === "gen"
      ? `gen-${this.counter}`
      : `00000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;
  }

  private matches(
    row: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean {
    return (this.options.filterMode ?? "all-keys") === "all-keys"
      ? matchesEveryKey(row, filter)
      : row.id === filter.id;
  }

  /** Rejects a point mutation whose filter omits `id` in "id-required" mode. */
  private guardFilter(filter: Record<string, unknown>): Promise<void> | null {
    if (this.options.filterMode === "id-required" && filter.id == null) {
      return Promise.reject(
        new Error("GraphQL errors: The argument `id` is required."),
      );
    }
    return null;
  }

  create(
    entity: RayfinEntityName,
    data: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const columns = toColumns(data);
    for (const field of this.options.requiredScalarFks?.[entity] ?? []) {
      if (columns[field] == null) {
        return Promise.reject(
          new Error(`${field} is a required field and cannot be null.`),
        );
      }
    }
    if (
      this.rejectsNonUuidId(entity) &&
      columns.id != null &&
      !UUID_RE.test(String(columns.id))
    ) {
      return Promise.reject(
        new Error(
          "GraphQL errors: The specified value type of field `id` does not match the field type.",
        ),
      );
    }
    const id = (columns.id as string | undefined) ?? this.mintId();
    this.table(entity).push({ ...columns, id });
    return Promise.resolve({ id });
  }

  update(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const rejected = this.guardFilter(filter);
    if (rejected) return rejected;
    const columns = toColumns(updates);
    for (const row of this.table(entity)) {
      if (this.matches(row, filter)) Object.assign(row, columns);
    }
    return Promise.resolve();
  }

  delete(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
  ): Promise<void> {
    const rejected = this.guardFilter(filter);
    if (rejected) return rejected;
    const rows = this.table(entity);
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (this.matches(rows[i], filter)) rows.splice(i, 1);
    }
    return Promise.resolve();
  }
}
