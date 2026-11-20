import type { RayfinReader } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";
import { readAllRows, type PagedEntityQuery } from "./rayfinPagination";
import type { SubmissionItemRow, SubmissionRow } from "./types";

// Foreign keys are selected as their snake_case DB columns (owner_id, asset_id,
// ...), not the camelCase scalar names: every FK on these entities backs a
// Rayfin @one() relationship, and DAB names the relationship's source column
// <relationship>_id (see rayfin/.temp/dab-config.json). Plain scalars
// (tenantId, createdAt, ...) keep their authored camelCase. rayfinMapper.ts maps
// the snake_case columns back to the UI dataset's camelCase fields.
//
// Exported so the self-host schema drift guard (rayfin/data/schemaDrift.test.ts) can
// assert the SQL migrations carry exactly these columns per entity, mechanizing the
// 1:1 sync rule between the migrations and the Rayfin mirror.
export const FIELDS: Record<string, string[]> = {
  Asset: [
    "id",
    "tenantId",
    "type",
    "name",
    "slug",
    "description",
    "system",
    "body",
    "version",
    "status",
    "riskLevel",
    "maturity",
    "tier",
    "stockVersion",
    "contentHash",
    "owner_id",
    "origin_id",
    "createdAt",
    "updatedAt",
  ],
  Tag: ["id", "tenantId", "kind", "name"],
  Origin: ["id", "tenantId", "name", "kind", "url"],
  Owner: ["id", "tenantId", "name", "email", "role"],
  Bundle: ["id", "tenantId", "name", "description"],
  AssetTag: ["id", "asset_id", "tag_id"],
  AssetDependency: ["id", "asset_id", "dependsOn_id"],
  BundleMembership: ["id", "bundle_id", "asset_id"],
  Utilization: [
    "id",
    "tenantId",
    "asset_id",
    "date",
    "invocations",
    "successes",
    "errors",
    "refusals",
    "latencyMs",
    "tokens",
    "cost",
    "model",
  ],
  RoutingStat: [
    "id",
    "tenantId",
    "asset_id",
    "date",
    "localHits",
    "externalFallbacks",
    "belowThreshold",
    "externalCost",
    "avoidedCostEstimate",
  ],
  EvalResult: [
    "id",
    "tenantId",
    "asset_id",
    "caseHash",
    "date",
    "trials",
    "passed",
    "failed",
    "errored",
    "inconclusive",
    "latencyMs",
    "tokens",
    "cost",
    "model",
    "quality",
    // Eval identity (PR12): durable bare references (no @one), so like the
    // submission island they are selected as authored camelCase, not snake_case.
    "assetRevisionId",
    "harness",
    "baselineId",
  ],
  Baseline: [
    "id",
    "tenantId",
    "kind",
    "assetRevisionId",
    "label",
    "createdAt",
  ],
  AssetRevision: [
    "id",
    "tenantId",
    "asset_id",
    "seq",
    "body",
    "contentHash",
    "createdAt",
    "createdByActor",
    "source",
  ],
  // Intervention references are bare @uuid scalars (no @one), so like the submission
  // island they are selected as authored camelCase, not snake_case.
  Intervention: [
    "id",
    "tenantId",
    "assetId",
    "revisionIdBefore",
    "date",
    "action",
    "outcome",
    "actor",
    "note",
    "effectiveScoreBefore",
    "invocationsBefore",
    "dedupeKey",
    "supersedesId",
    "recordedAt",
  ],
  // Submission/SubmissionItem FKs are plain @uuid scalars (no @one navigation), so
  // they are selected as authored camelCase, not snake_case.
  Submission: [
    "id",
    "tenantId",
    "submittedByOwnerId",
    "originId",
    "status",
    "itemCount",
    "acceptedCount",
    "rejectedCount",
    "conflictCount",
    "contentHash",
    "submittedAt",
    "reviewedByOwnerId",
    "reviewedAt",
    "note",
  ],
  SubmissionItem: [
    "id",
    "tenantId",
    "submissionId",
    "assetName",
    "assetType",
    "assetSlug",
    "description",
    "system",
    "body",
    "version",
    "assetStatus",
    "riskLevel",
    "maturity",
    "tier",
    "stockVersion",
    "contentHash",
    "dedupVerdict",
    "duplicateAssetId",
    "decision",
    "reviewerNote",
  ],
};

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);

const optionalIso = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : toIso(value);

function mapSubmission(row: Record<string, unknown>): SubmissionRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    submittedByOwnerId: String(row.submittedByOwnerId),
    originId: (row.originId as string | undefined) ?? undefined,
    status: row.status as SubmissionRow["status"],
    itemCount: Number(row.itemCount),
    acceptedCount: Number(row.acceptedCount),
    rejectedCount: Number(row.rejectedCount),
    conflictCount: Number(row.conflictCount),
    contentHash: String(row.contentHash),
    submittedAt: toIso(row.submittedAt),
    reviewedByOwnerId:
      (row.reviewedByOwnerId as string | undefined) ?? undefined,
    reviewedAt: optionalIso(row.reviewedAt),
    note: (row.note as string | undefined) ?? undefined,
  };
}

// assetId and tagIds are not persisted on the Fabric SubmissionItem (the reconcile
// key is assetType+assetSlug and the asset id is minted at accept; tags are deferred),
// so they are synthesized on read: assetId mirrors the row id, tagIds is empty.
function mapSubmissionItem(row: Record<string, unknown>): SubmissionItemRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    submissionId: String(row.submissionId),
    assetId: String(row.id),
    assetName: String(row.assetName),
    assetType: row.assetType as SubmissionItemRow["assetType"],
    assetSlug: String(row.assetSlug),
    description: String(row.description ?? ""),
    system: (row.system as string | undefined) ?? undefined,
    body: String(row.body ?? ""),
    version: String(row.version),
    assetStatus: row.assetStatus as SubmissionItemRow["assetStatus"],
    riskLevel: row.riskLevel as SubmissionItemRow["riskLevel"],
    maturity: Number(row.maturity),
    tier: row.tier as SubmissionItemRow["tier"],
    stockVersion: (row.stockVersion as string | undefined) ?? undefined,
    contentHash: String(row.contentHash),
    tagIds: [],
    dedupVerdict: row.dedupVerdict as SubmissionItemRow["dedupVerdict"],
    duplicateAssetId: (row.duplicateAssetId as string | undefined) ?? undefined,
    decision: row.decision as SubmissionItemRow["decision"],
    reviewerNote: (row.reviewerNote as string | undefined) ?? undefined,
  };
}

/**
 * Concrete reader over the live Rayfin client. The client is imported dynamically
 * so the seed and demo paths never pull the Rayfin client into their bundle. Only
 * exercised when createDataSource selects the Fabric source; validated at deploy.
 */
export function createRayfinReader(): RayfinReader {
  return {
    async readAll(): Promise<RayfinEntities> {
      const { getRayfinClient } = await import("@/services/rayfinClient");
      const data = getRayfinClient().data as unknown as Record<
        string,
        PagedEntityQuery
      >;
      // Paginated: a plain execute() returns only DAB's first page (100 rows),
      // which truncates the dataset once the catalog grows past it.
      const read = (name: string) => readAllRows(data[name], FIELDS[name]);
      const [
        assets,
        tags,
        origins,
        owners,
        bundles,
        assetTags,
        dependencies,
        bundleMemberships,
        utilization,
        evalResults,
        routingStats,
        baselines,
        assetRevisions,
        interventions,
      ] = await Promise.all([
        read("Asset"),
        read("Tag"),
        read("Origin"),
        read("Owner"),
        read("Bundle"),
        read("AssetTag"),
        read("AssetDependency"),
        read("BundleMembership"),
        read("Utilization"),
        read("EvalResult"),
        read("RoutingStat"),
        read("Baseline"),
        read("AssetRevision"),
        read("Intervention"),
      ]);
      return {
        assets,
        tags,
        origins,
        owners,
        bundles,
        assetTags,
        dependencies,
        bundleMemberships,
        utilization,
        evalResults,
        routingStats,
        baselines,
        assetRevisions,
        interventions,
      } as unknown as RayfinEntities;
    },

    async readSubmissions(): Promise<{
      submissions: SubmissionRow[];
      items: SubmissionItemRow[];
    }> {
      const { getRayfinClient } = await import("@/services/rayfinClient");
      const data = getRayfinClient().data as unknown as Record<
        string,
        PagedEntityQuery
      >;
      const read = (name: string) => readAllRows(data[name], FIELDS[name]);
      const [submissionsRaw, itemsRaw] = await Promise.all([
        read("Submission"),
        read("SubmissionItem"),
      ]);
      return {
        submissions: (submissionsRaw as Record<string, unknown>[]).map(
          mapSubmission,
        ),
        items: (itemsRaw as Record<string, unknown>[]).map(mapSubmissionItem),
      };
    },
  };
}
