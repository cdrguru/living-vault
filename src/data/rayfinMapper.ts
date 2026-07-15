import type {
  AssetRow,
  BundleRow,
  EvalResultRow,
  OriginRow,
  OwnerRow,
  TagRow,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "./types";

/**
 * The Rayfin entity rows as returned by the Fabric backend. They diverge from the
 * UI row types in three documented, intentional ways: Asset and Utilization carry
 * native Date fields; the three join entities carry a surrogate uuid id that the UI
 * contract shape omits; and every foreign key arrives as its snake_case DB column
 * (owner_id, origin_id, asset_id, tag_id, dependsOn_id, bundle_id) because each FK
 * backs a Rayfin @one() relationship whose source column DAB names <relationship>_id.
 * entitiesToDataset maps those back to the UI's camelCase fields. The dimension rows
 * (Tag, Origin, Owner, Bundle) carry no FK and match their UI shape exactly.
 * See docs/design/the-living-vault-model-visual.md.
 */
export interface RayfinAssetEntity extends Omit<
  AssetRow,
  "createdAt" | "updatedAt" | "ownerId" | "originId"
> {
  owner_id?: string;
  origin_id?: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface RayfinUtilizationEntity extends Omit<
  UtilizationRow,
  "date" | "assetId"
> {
  asset_id: string;
  date: Date;
}
export interface RayfinEvalResultEntity extends Omit<
  EvalResultRow,
  "date" | "assetId"
> {
  asset_id: string;
  date: Date;
}
export interface RayfinAssetTagEntity {
  id: string;
  asset_id: string;
  tag_id: string;
}
export interface RayfinAssetDependencyEntity {
  id: string;
  asset_id: string;
  dependsOn_id: string;
}
export interface RayfinBundleMembershipEntity {
  id: string;
  bundle_id: string;
  asset_id: string;
}

export interface RayfinEntities {
  assets: RayfinAssetEntity[];
  tags: TagRow[];
  origins: OriginRow[];
  owners: OwnerRow[];
  bundles: BundleRow[];
  assetTags: RayfinAssetTagEntity[];
  dependencies: RayfinAssetDependencyEntity[];
  bundleMemberships: RayfinBundleMembershipEntity[];
  utilization: RayfinUtilizationEntity[];
  evalResults: RayfinEvalResultEntity[];
}

const iso = (value: Date): string => new Date(value).toISOString();
const isoDate = (value: Date): string =>
  new Date(value).toISOString().slice(0, 10);

/**
 * Map Rayfin entity rows to the normalized VaultDataset the UI consumes: Date
 * fields become ISO strings and join surrogate ids are dropped. Pure, so the
 * read path is testable without a live backend.
 */
export function entitiesToDataset(entities: RayfinEntities): VaultDataset {
  const utilization = entities.utilization.map(
    ({ asset_id, ...rest }): UtilizationRow => ({
      ...rest,
      assetId: asset_id,
      date: isoDate(rest.date),
    }),
  );
  const evalResults = entities.evalResults.map(
    ({ asset_id, ...rest }): EvalResultRow => ({
      ...rest,
      assetId: asset_id,
      date: isoDate(rest.date),
    }),
  );
  return {
    assets: entities.assets.map(
      ({ owner_id, origin_id, ...rest }): AssetRow => ({
        ...rest,
        ownerId: owner_id,
        originId: origin_id,
        createdAt: iso(rest.createdAt),
        updatedAt: iso(rest.updatedAt),
      }),
    ),
    tags: entities.tags.map((tag): TagRow => ({ ...tag })),
    origins: entities.origins.map((origin): OriginRow => ({ ...origin })),
    owners: entities.owners.map((owner): OwnerRow => ({ ...owner })),
    bundles: entities.bundles.map((bundle): BundleRow => ({ ...bundle })),
    assetTags: entities.assetTags.map(({ asset_id, tag_id }) => ({
      assetId: asset_id,
      tagId: tag_id,
    })),
    dependencies: entities.dependencies.map(({ asset_id, dependsOn_id }) => ({
      assetId: asset_id,
      dependsOnAssetId: dependsOn_id,
    })),
    bundleMemberships: entities.bundleMemberships.map(
      ({ bundle_id, asset_id }) => ({
        bundleId: bundle_id,
        assetId: asset_id,
      }),
    ),
    utilization,
    evalResults,
    telemetryMeta: deriveLiveTelemetryMeta(utilization),
  };
}

/**
 * Synthesize the telemetry marker the UI keys off (telemetryMeta) from the live
 * Utilization rows. telemetryMeta is snapshot metadata with no Fabric entity (see
 * types.ts), so the live read cannot carry the real one; without this the deployed
 * app reports "telemetry not synced" forever, even after a successful import. Returns
 * undefined when there are no rows (genuinely not synced). The window spans the rows'
 * dates; `sessions` is not recoverable from rows, so it is 0; `tracked` reflects the
 * columns Utilization rows carry. No probe metadata is synthesized, so live rows read
 * as real usage rather than probe-seeded.
 */
function deriveLiveTelemetryMeta(
  utilization: UtilizationRow[],
): TelemetryMeta | undefined {
  if (utilization.length === 0) return undefined;
  let windowStart = utilization[0].date;
  let windowEnd = utilization[0].date;
  let hasModel = false;
  for (const row of utilization) {
    if (row.date < windowStart) windowStart = row.date;
    if (row.date > windowEnd) windowEnd = row.date;
    if (row.model != null && row.model !== "") hasModel = true;
  }
  return {
    source: "claude-code",
    generatedAt: `${windowEnd}T00:00:00.000Z`,
    windowStart,
    windowEnd,
    sessions: 0,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: true,
      tokens: true,
      cost: true,
      model: hasModel,
    },
  };
}

/**
 * The surrogate uuid primary keys of the three join entities, indexed by the same
 * composite FK key the write path reconciles on. entitiesToDataset deliberately drops
 * these ids from the UI dataset, but a join-row *delete* needs them: DAB's generated
 * point delete/update mutations are keyed on the primary key `id`, not the FK columns,
 * so a delete filtered by { asset_id, tag_id } fails with "The argument `id` is
 * required". The keys here MUST match the key() functions in RayfinDataSource.syncJoin
 * and the inline keys in updateAsset/deleteAsset.
 */
export interface JoinIdIndex {
  assetTags: Map<string, string>;
  dependencies: Map<string, string>;
  bundleMemberships: Map<string, string>;
}

export function indexJoinIds(entities: RayfinEntities): JoinIdIndex {
  const assetTags = new Map<string, string>();
  for (const row of entities.assetTags) {
    assetTags.set(`${row.asset_id}::${row.tag_id}`, row.id);
  }
  const dependencies = new Map<string, string>();
  for (const row of entities.dependencies) {
    dependencies.set(`${row.asset_id}::${row.dependsOn_id}`, row.id);
  }
  const bundleMemberships = new Map<string, string>();
  for (const row of entities.bundleMemberships) {
    bundleMemberships.set(`${row.bundle_id}::${row.asset_id}`, row.id);
  }
  return { assetTags, dependencies, bundleMemberships };
}
