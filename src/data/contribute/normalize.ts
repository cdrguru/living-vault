import { contentHashOf } from "../hash";
import type { ProjectionInput } from "../merge";
import type {
  AssetDependencyRow,
  AssetRow,
  AssetStatus,
  AssetTagRow,
  AssetTier,
  AssetType,
  BundleMembershipRow,
  BundleRow,
  OriginKind,
  OriginRow,
  OwnerRow,
  RiskLevel,
  TagKind,
  TagRow,
} from "../types";

/**
 * Turn an uploaded contribution (a projection JSON, or a bare array of assets) into
 * a validated, contract-clean {@link ProjectionInput} ready for DataSource.importProjection.
 *
 * This is the zero-infrastructure contribution path: a contributor uploads their
 * catalog instead of running a local collector. It is intentionally forgiving about
 * shape and strict about coherence:
 * - missing collections default to empty (an upload may carry only `assets`);
 * - `contentHash` is always recomputed from (type, body) so the coherence contract
 *   passes regardless of what the file claimed;
 * - join rows and asset owner/origin refs that do not resolve within the upload are
 *   dropped rather than allowed to dangle, so importProjection's contract gate never
 *   rejects a well-meaning upload;
 * - `tenantId` is a placeholder here; mergeProjection re-stamps it to the vault tenant.
 *
 * Owner attribution (stamping every asset with the signed-in contributor and the
 * per-owner telemetry slice) is the next phase and is intentionally optional here.
 */
export interface ContributeOptions {
  /** Stamp every uploaded asset with this contributor's ownerId. */
  ownerId?: string;
  /** Owner row to inject so the stamped ownerId resolves (and the contributor exists). */
  owner?: OwnerRow;
  /** Stamp every uploaded asset under this originId (the contributor's source repo). */
  originId?: string;
  /** Origin row to inject so the stamped originId resolves. */
  origin?: OriginRow;
  /** tenantId placed on synthesized rows; mergeProjection re-stamps assets to the vault tenant. */
  tenantId?: string;
}

/** Thrown when an upload cannot be coerced into a usable projection. Message is user-facing. */
export class ContributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContributionError";
  }
}

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000000";

/** Cap on assets per upload, so a crafted file cannot freeze the main thread. */
const MAX_ASSETS = 5000;

const ASSET_TYPES: readonly AssetType[] = [
  "skill",
  "subagent",
  "prompt",
  "mcp-server",
  "hook",
  "command",
  "workflow",
];
const ASSET_STATUSES: readonly AssetStatus[] = [
  "active",
  "deprecated",
  "retired",
  "plugin-managed",
  "project-specific",
];
const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"];
const ASSET_TIERS: readonly AssetTier[] = ["stock", "custom", "forked"];
const TAG_KINDS: readonly TagKind[] = ["domain", "capability", "pillar"];
const ORIGIN_KINDS: readonly OriginKind[] = [
  "repo",
  "url",
  "local",
  "plugin",
  "giac",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ContributionError(`"${field}" must be an array if present.`);
  }
  return value;
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function requireStr(
  obj: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const v = str(obj, key);
  if (v === undefined || v.trim() === "") {
    throw new ContributionError(
      `${where}: missing required text field "${key}".`,
    );
  }
  return v;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function upsertRow<T extends { id: string }>(rows: T[], row: T): void {
  const index = rows.findIndex((r) => r.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.push(row);
}

function normalizeAsset(
  raw: unknown,
  index: number,
  tenantId: string,
  opts: ContributeOptions,
  nowIso: string,
): AssetRow {
  if (!isRecord(raw)) {
    throw new ContributionError(`assets[${index}] is not an object.`);
  }
  const name = requireStr(raw, "name", `assets[${index}]`);
  const rawType = str(raw, "type");
  if (rawType === undefined) {
    throw new ContributionError(`asset "${name}": missing required "type".`);
  }
  if (!(ASSET_TYPES as readonly string[]).includes(rawType)) {
    throw new ContributionError(
      `asset "${name}": unknown type "${rawType}" (expected one of ${ASSET_TYPES.join(", ")}).`,
    );
  }
  const type = rawType as AssetType;
  // Always slugify (never pass an uploaded slug through verbatim): keeps ids and
  // the (type, slug) reconcile key in the clean form the rest of the codebase uses.
  const slug = slugify(str(raw, "slug")?.trim() || name) || "asset";
  const body = str(raw, "body") ?? "";
  const tier = oneOf(raw.tier, ASSET_TIERS, "custom");
  // Contract rules: forked requires a non-empty stockVersion, stock forbids it.
  // `|| default` (not `??`) so an empty/whitespace string also falls back.
  let stockVersion: string | undefined;
  if (tier === "forked")
    stockVersion = str(raw, "stockVersion")?.trim() || "1.0.0";
  else if (tier === "custom")
    stockVersion = str(raw, "stockVersion")?.trim() || undefined;

  return {
    id: str(raw, "id")?.trim() || `contrib-${type}-${slug}`,
    tenantId,
    type,
    name,
    slug,
    description: str(raw, "description") ?? "",
    system: str(raw, "system"),
    body,
    version: str(raw, "version") ?? "1.0.0",
    status: oneOf(raw.status, ASSET_STATUSES, "active"),
    riskLevel: oneOf(raw.riskLevel, RISK_LEVELS, "low"),
    maturity: Math.min(1, Math.max(0, num(raw.maturity, 0.5))),
    tier,
    stockVersion,
    contentHash: contentHashOf(type, body),
    ownerId: opts.ownerId ?? str(raw, "ownerId"),
    originId: opts.originId ?? str(raw, "originId"),
    createdAt: str(raw, "createdAt") ?? nowIso,
    updatedAt: str(raw, "updatedAt") ?? nowIso,
  };
}

function normalizeTag(raw: unknown, index: number, tenantId: string): TagRow {
  if (!isRecord(raw))
    throw new ContributionError(`tags[${index}] is not an object.`);
  const name = requireStr(raw, "name", `tags[${index}]`);
  return {
    id: str(raw, "id")?.trim() || `tag-${slugify(name)}`,
    tenantId,
    kind: oneOf(raw.kind, TAG_KINDS, "capability"),
    name,
  };
}

function normalizeOrigin(
  raw: unknown,
  index: number,
  tenantId: string,
): OriginRow {
  if (!isRecord(raw))
    throw new ContributionError(`origins[${index}] is not an object.`);
  const name = requireStr(raw, "name", `origins[${index}]`);
  return {
    id: str(raw, "id")?.trim() || `origin-${slugify(name)}`,
    tenantId,
    name,
    kind: oneOf(raw.kind, ORIGIN_KINDS, "repo"),
    url: str(raw, "url"),
  };
}

function normalizeOwner(
  raw: unknown,
  index: number,
  tenantId: string,
): OwnerRow {
  if (!isRecord(raw))
    throw new ContributionError(`owners[${index}] is not an object.`);
  const name = requireStr(raw, "name", `owners[${index}]`);
  return {
    id: str(raw, "id")?.trim() || `owner-${slugify(name)}`,
    tenantId,
    name,
    email: str(raw, "email") ?? "",
    // An uploaded owner role is never trusted: a contribution must not be able to mint
    // or grant a privileged owner. Always the lowest role; promotion is a maintainer
    // action outside the contribution path. See createDataSource's canReview gate.
    role: "viewer",
  };
}

function normalizeBundle(
  raw: unknown,
  index: number,
  tenantId: string,
): BundleRow {
  if (!isRecord(raw))
    throw new ContributionError(`bundles[${index}] is not an object.`);
  const name = requireStr(raw, "name", `bundles[${index}]`);
  return {
    id: str(raw, "id")?.trim() || `bundle-${slugify(name)}`,
    tenantId,
    name,
    description: str(raw, "description") ?? "",
  };
}

export function normalizeContribution(
  raw: unknown,
  opts: ContributeOptions = {},
): ProjectionInput {
  const root: Record<string, unknown> = Array.isArray(raw)
    ? { assets: raw }
    : isRecord(raw)
      ? raw
      : (() => {
          throw new ContributionError(
            'Uploaded content must be a JSON object with an "assets" array, or a JSON array of assets.',
          );
        })();

  if (opts.ownerId && !opts.owner) {
    throw new ContributionError(
      "ownerId was provided without a matching owner row (pass opts.owner so the attribution resolves instead of being dropped).",
    );
  }

  const tenantId = opts.tenantId ?? PLACEHOLDER_TENANT;
  const nowIso = new Date().toISOString();

  const tags = asArray(root.tags, "tags").map((r, i) =>
    normalizeTag(r, i, tenantId),
  );
  const origins = asArray(root.origins, "origins").map((r, i) =>
    normalizeOrigin(r, i, tenantId),
  );
  const owners = asArray(root.owners, "owners").map((r, i) =>
    normalizeOwner(r, i, tenantId),
  );
  const bundles = asArray(root.bundles, "bundles").map((r, i) =>
    normalizeBundle(r, i, tenantId),
  );

  if (opts.owner) upsertRow(owners, { ...opts.owner, tenantId });
  if (opts.origin) upsertRow(origins, { ...opts.origin, tenantId });

  const rawAssets = asArray(root.assets, "assets");
  if (rawAssets.length > MAX_ASSETS) {
    throw new ContributionError(
      `Too many assets (${rawAssets.length}); the maximum per upload is ${MAX_ASSETS}.`,
    );
  }
  const assets = rawAssets.map((r, i) =>
    normalizeAsset(r, i, tenantId, opts, nowIso),
  );
  if (assets.length === 0) {
    throw new ContributionError("No assets found in the upload.");
  }

  const seenAssetIds = new Set<string>();
  const duplicateAssetIds = new Set<string>();
  for (const asset of assets) {
    if (seenAssetIds.has(asset.id)) duplicateAssetIds.add(asset.id);
    seenAssetIds.add(asset.id);
  }
  if (duplicateAssetIds.size > 0) {
    throw new ContributionError(
      `Duplicate asset id(s) in upload: ${[...duplicateAssetIds].join(", ")}.`,
    );
  }

  const assetIds = new Set(assets.map((a) => a.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const ownerIds = new Set(owners.map((o) => o.id));
  const originIds = new Set(origins.map((o) => o.id));
  const bundleIds = new Set(bundles.map((b) => b.id));

  // Drop asset FK refs that do not resolve within the upload so referential
  // integrity holds (the contract rejects dangling ownerId/originId).
  for (const asset of assets) {
    if (asset.ownerId && !ownerIds.has(asset.ownerId))
      asset.ownerId = undefined;
    if (asset.originId && !originIds.has(asset.originId))
      asset.originId = undefined;
  }

  const assetTags: AssetTagRow[] = asArray(root.assetTags, "assetTags")
    .filter(isRecord)
    .map((r) => ({
      assetId: String(r.assetId ?? ""),
      tagId: String(r.tagId ?? ""),
    }))
    .filter((r) => assetIds.has(r.assetId) && tagIds.has(r.tagId));

  const dependencies: AssetDependencyRow[] = asArray(
    root.dependencies,
    "dependencies",
  )
    .filter(isRecord)
    .map((r) => ({
      assetId: String(r.assetId ?? ""),
      dependsOnAssetId: String(r.dependsOnAssetId ?? ""),
    }))
    .filter((r) => assetIds.has(r.assetId) && assetIds.has(r.dependsOnAssetId));

  const bundleMemberships: BundleMembershipRow[] = asArray(
    root.bundleMemberships,
    "bundleMemberships",
  )
    .filter(isRecord)
    .map((r) => ({
      bundleId: String(r.bundleId ?? ""),
      assetId: String(r.assetId ?? ""),
    }))
    .filter((r) => bundleIds.has(r.bundleId) && assetIds.has(r.assetId));

  return {
    assets,
    tags,
    origins,
    owners,
    bundles,
    assetTags,
    dependencies,
    bundleMemberships,
  };
}

/** Parse uploaded file text as JSON, then normalize. Separates parse errors from shape errors. */
export function parseContribution(
  text: string,
  opts: ContributeOptions = {},
): ProjectionInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ContributionError("File is not valid JSON.");
  }
  return normalizeContribution(parsed, opts);
}
