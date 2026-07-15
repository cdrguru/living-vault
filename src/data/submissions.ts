import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import type {
  AssetRow,
  AssetTagRow,
  SubmissionDedupVerdict,
  SubmissionItemDecision,
  SubmissionItemRow,
  SubmissionRow,
  SubmissionStatus,
  VaultDataset,
} from "./types";

// Mirror merge.ts so a submission's dedup target is the exact catalog row that
// importProjection (reconcileByTypeSlug) would update on accept.
const KEY_SEP = "::";
const OVERLAY_ID_PREFIX = "cc-";

const typeSlugKey = (type: string, slug: string): string =>
  `${type}${KEY_SEP}${slug}`;

/**
 * Index catalog assets by (type, slug). When several rows share a key the
 * telemetry-bearing overlay id (cc-) wins over a stock seed id, independent of
 * array order, so the dedup target matches resolveIncomingIds in merge.ts.
 */
export function catalogByTypeSlug(
  dataset: VaultDataset,
): Map<string, AssetRow> {
  const byKey = new Map<string, AssetRow>();
  for (const asset of dataset.assets) {
    const key = typeSlugKey(asset.type, asset.slug);
    const incumbent = byKey.get(key);
    const preferIncoming =
      incumbent === undefined ||
      (!incumbent.id.startsWith(OVERLAY_ID_PREFIX) &&
        asset.id.startsWith(OVERLAY_ID_PREFIX));
    if (preferIncoming) byKey.set(key, asset);
  }
  return byKey;
}

/**
 * Classify a staged asset against the catalog index: new when no row shares its
 * (type, slug); duplicate when one does with an identical contentHash; conflict
 * when one does with a different contentHash. duplicateAssetId points at the row
 * accept would update.
 */
export function classifyStagedAsset(
  index: Map<string, AssetRow>,
  staged: AssetRow,
): { verdict: SubmissionDedupVerdict; duplicateAssetId?: string } {
  const match = index.get(typeSlugKey(staged.type, staged.slug));
  if (!match) return { verdict: "new" };
  return {
    verdict:
      match.contentHash === staged.contentHash ? "duplicate" : "conflict",
    duplicateAssetId: match.id,
  };
}

/**
 * Stable hash over the staged items, used to detect an identical re-submission.
 * Order-independent: items are canonicalized by (type, slug, contentHash) and
 * sorted before hashing.
 */
export function submissionContentHash(items: SubmissionItemRow[]): string {
  const canonical = items
    .map(
      (item) =>
        `${item.assetType}${KEY_SEP}${item.assetSlug}${KEY_SEP}${item.contentHash}`,
    )
    .sort()
    .join("|");
  return contentHashOf("submission", canonical);
}

/**
 * Resolve a submission's status from its items' decisions after a review pass.
 * Any item left for refinement requests changes; any still-pending item keeps the
 * submission under review; otherwise it is accepted when at least one item was
 * accepted, else rejected.
 */
export function resolveSubmissionStatus(
  items: SubmissionItemRow[],
): SubmissionStatus {
  if (items.some((item) => item.decision === "refine")) {
    return "changes_requested";
  }
  if (items.some((item) => item.decision === "pending")) {
    return "under_review";
  }
  return items.some((item) => item.decision === "accept")
    ? "accepted"
    : "rejected";
}

// ---------------------------------------------------------------------------
// Submit / decide orchestration, pure and source-agnostic.
//
// These build the submission rows and the accept-time ProjectionInput from a
// catalog snapshot, so every DataSource (seed now, Fabric later) shares one
// tested code path. The impure edges (id generation, timestamps, persistence,
// and the importProjection call) stay in the DataSource; the asset id at accept
// is supplied by an injected minter so seed can keep its stable contrib id while
// Fabric mints a UUID.
// ---------------------------------------------------------------------------

export interface BuildSubmissionOptions {
  submissionId: string;
  tenantId: string;
  /** ISO timestamp for submittedAt. */
  now: string;
  submittedByOwnerId: string;
  originId?: string;
  note?: string;
  /**
   * Id for a staged item. Defaults to a deterministic `${submissionId}-item-N`
   * (seed); the Fabric source injects a UUID minter so item ids satisfy @uuid.
   */
  mintItemId?: (submissionId: string, index: number) => string;
}

/** Build a pending Submission plus its staged items from a normalized projection. */
export function buildSubmission(
  catalog: VaultDataset,
  incoming: ProjectionInput,
  options: BuildSubmissionOptions,
): { submission: SubmissionRow; items: SubmissionItemRow[] } {
  const index = catalogByTypeSlug(catalog);
  const mintItemId =
    options.mintItemId ??
    ((submissionId: string, position: number) =>
      `${submissionId}-item-${position}`);
  const items: SubmissionItemRow[] = incoming.assets.map((asset, position) => {
    const { verdict, duplicateAssetId } = classifyStagedAsset(index, asset);
    return {
      id: mintItemId(options.submissionId, position),
      tenantId: options.tenantId,
      submissionId: options.submissionId,
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type,
      assetSlug: asset.slug,
      description: asset.description,
      system: asset.system,
      body: asset.body,
      version: asset.version,
      assetStatus: asset.status,
      riskLevel: asset.riskLevel,
      maturity: asset.maturity,
      tier: asset.tier,
      stockVersion: asset.stockVersion,
      contentHash: asset.contentHash,
      tagIds: incoming.assetTags
        .filter((tag) => tag.assetId === asset.id)
        .map((tag) => tag.tagId),
      dedupVerdict: verdict,
      duplicateAssetId,
      decision: "pending",
    };
  });

  const submission: SubmissionRow = {
    id: options.submissionId,
    tenantId: options.tenantId,
    submittedByOwnerId: options.submittedByOwnerId,
    originId: options.originId,
    status: "submitted",
    itemCount: items.length,
    acceptedCount: 0,
    rejectedCount: 0,
    conflictCount: items.filter((item) => item.dedupVerdict === "conflict")
      .length,
    contentHash: submissionContentHash(items),
    submittedAt: options.now,
    note: options.note,
  };

  return { submission, items };
}

/** One reviewer decision on a staged item. */
export interface ItemDecision {
  itemId: string;
  decision: SubmissionItemDecision;
  reviewerNote?: string;
}

/** Apply reviewer decisions to items, returning new rows (does not mutate input). */
export function applyDecisions(
  items: SubmissionItemRow[],
  decisions: ItemDecision[],
): SubmissionItemRow[] {
  const byId = new Map(
    decisions.map((decision) => [decision.itemId, decision]),
  );
  return items.map((item) => {
    const decision = byId.get(item.id);
    if (!decision) return item;
    return {
      ...item,
      decision: decision.decision,
      reviewerNote:
        decision.reviewerNote !== undefined
          ? decision.reviewerNote
          : item.reviewerNote,
    };
  });
}

export interface AcceptAssemblyOptions {
  tenantId: string;
  /** ISO timestamp for createdAt/updatedAt on the accepted assets. */
  now: string;
  /** Id for the accepted asset: seed reuses the staged id, Fabric mints a UUID. */
  mintAssetId: (item: SubmissionItemRow) => string;
}

/**
 * Assemble a ProjectionInput from accepted items, ready for importProjection.
 * Owner/origin are stamped from the submission only when they resolve in the
 * catalog (so the contract never sees a dangling FK); tagIds carry only when the
 * tag exists in the catalog. The asset id comes from the injected minter and the
 * tag link references that same minted id.
 */
export function assembleAcceptedProjection(
  catalog: VaultDataset,
  submission: Pick<SubmissionRow, "submittedByOwnerId" | "originId">,
  acceptedItems: SubmissionItemRow[],
  options: AcceptAssemblyOptions,
): ProjectionInput {
  const ownerId = catalog.owners.some(
    (owner) => owner.id === submission.submittedByOwnerId,
  )
    ? submission.submittedByOwnerId
    : undefined;
  const originId =
    submission.originId &&
    catalog.origins.some((origin) => origin.id === submission.originId)
      ? submission.originId
      : undefined;
  const knownTagIds = new Set(catalog.tags.map((tag) => tag.id));

  const assets: AssetRow[] = acceptedItems.map((item) => ({
    id: options.mintAssetId(item),
    tenantId: options.tenantId,
    type: item.assetType,
    name: item.assetName,
    slug: item.assetSlug,
    description: item.description,
    system: item.system,
    body: item.body,
    version: item.version,
    status: item.assetStatus,
    riskLevel: item.riskLevel,
    maturity: item.maturity,
    tier: item.tier,
    stockVersion: item.stockVersion,
    contentHash: contentHashOf(item.assetType, item.body),
    ownerId,
    originId,
    createdAt: options.now,
    updatedAt: options.now,
  }));

  const assetTags: AssetTagRow[] = acceptedItems.flatMap((item, index) =>
    item.tagIds
      .filter((tagId) => knownTagIds.has(tagId))
      .map((tagId) => ({ assetId: assets[index].id, tagId })),
  );

  return {
    assets,
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags,
    dependencies: [],
    bundleMemberships: [],
  };
}

export interface FinalizeOptions {
  reviewedByOwnerId: string;
  /** ISO timestamp for reviewedAt. */
  reviewedAt: string;
  note?: string;
}

/** Recompute a submission's counts and status from its decided items. */
export function finalizeSubmission(
  submission: SubmissionRow,
  items: SubmissionItemRow[],
  options: FinalizeOptions,
): SubmissionRow {
  return {
    ...submission,
    acceptedCount: items.filter((item) => item.decision === "accept").length,
    rejectedCount: items.filter((item) => item.decision === "reject").length,
    conflictCount: items.filter((item) => item.dedupVerdict === "conflict")
      .length,
    status: resolveSubmissionStatus(items),
    reviewedByOwnerId: options.reviewedByOwnerId,
    reviewedAt: options.reviewedAt,
    note: options.note !== undefined ? options.note : submission.note,
  };
}
