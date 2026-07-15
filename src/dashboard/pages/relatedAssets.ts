import { bundlesOf, dependenciesOf } from "@/data/metrics";
import type { AssetRow, VaultDataset } from "@/data/types";

/** One plain-English reason a candidate is related to the current asset. */
export interface RelatedAssetReason {
  /** Stable per-candidate key so React can key a reason chip without index churn. */
  key: string;
  label: string;
}

export interface RelatedAssetViewModel {
  asset: AssetRow;
  /** Higher ranks first. Only meaningful as a relative ordering, not an absolute unit. */
  score: number;
  reasons: RelatedAssetReason[];
}

/**
 * Large, well-separated tiers so a single stronger signal always outranks any
 * plausible accumulation of weaker ones (a direct dependency beats a candidate
 * that merely shares a bundle, a dozen tags, an owner, an origin, and a type all
 * at once). This mirrors the suggested priority order: requires > required-by >
 * bundle > tags > owner > origin > type.
 *
 * Each category contributes its tier weight AT MOST ONCE per candidate, even
 * when the candidate matches several items in that category (several shared
 * bundles, several shared tags): the sum of every weaker tier's max
 * contribution (owner + origin + type, or tag + owner + origin + type, and so
 * on) always stays below the next tier up, so the ordering holds regardless of
 * how much overlap two assets happen to have.
 */
const WEIGHT = {
  requires: 100_000,
  requiredBy: 50_000,
  bundle: 10_000,
  tag: 1_000,
  owner: 100,
  origin: 50,
  type: 10,
} as const;

/**
 * Related assets for one asset's detail page, derived entirely from the existing
 * VaultDataset (no new storage, no telemetry content). The current asset is never
 * included. Every candidate with at least one matching signal is scored and given
 * one or more plain-English reasons; candidates with no signal at all are dropped.
 * Results are sorted by descending score, then by name for a stable, predictable
 * order when scores tie.
 */
export function getRelatedAssets(
  dataset: VaultDataset,
  assetId: string,
): RelatedAssetViewModel[] {
  const asset = dataset.assets.find((row) => row.id === assetId);
  if (!asset) return [];

  const { requires, requiredBy } = dependenciesOf(dataset, assetId);
  const requiresIds = new Set(requires.map((row) => row.id));
  const requiredByIds = new Set(requiredBy.map((row) => row.id));

  const bundles = bundlesOf(dataset, assetId);
  const bundleIds = new Set(bundles.map((bundle) => bundle.id));
  const bundlesByAsset = new Map<string, Set<string>>();
  for (const membership of dataset.bundleMemberships) {
    if (!bundleIds.has(membership.bundleId)) continue;
    const set = bundlesByAsset.get(membership.assetId) ?? new Set<string>();
    set.add(membership.bundleId);
    bundlesByAsset.set(membership.assetId, set);
  }

  const tagsById = new Map(dataset.tags.map((tag) => [tag.id, tag]));
  const tagIdsByAsset = new Map<string, Set<string>>();
  for (const row of dataset.assetTags) {
    const set = tagIdsByAsset.get(row.assetId) ?? new Set<string>();
    set.add(row.tagId);
    tagIdsByAsset.set(row.assetId, set);
  }
  const currentTagIds = tagIdsByAsset.get(assetId) ?? new Set<string>();

  const owner = asset.ownerId
    ? dataset.owners.find((row) => row.id === asset.ownerId)
    : undefined;
  const origin = asset.originId
    ? dataset.origins.find((row) => row.id === asset.originId)
    : undefined;

  const results: RelatedAssetViewModel[] = [];

  for (const candidate of dataset.assets) {
    if (candidate.id === assetId) continue;

    const reasons: RelatedAssetReason[] = [];
    let score = 0;

    // Labels read with the candidate as the subject and "this asset" as the
    // current page asset (the same convention as the Requires / Required by
    // panels), so the dependency direction is never ambiguous: a candidate the
    // current asset requires is "a dependency of this asset"; a candidate that
    // requires the current asset "depends on this asset".
    if (requiresIds.has(candidate.id)) {
      reasons.push({ key: "dependency", label: "a dependency of this asset" });
      score += WEIGHT.requires;
    }
    if (requiredByIds.has(candidate.id)) {
      reasons.push({ key: "dependent", label: "depends on this asset" });
      score += WEIGHT.requiredBy;
    }

    const candidateBundleIds = bundlesByAsset.get(candidate.id);
    if (candidateBundleIds) {
      const sharedBundles = bundles.filter((bundle) =>
        candidateBundleIds.has(bundle.id),
      );
      for (const bundle of sharedBundles) {
        reasons.push({
          key: `bundle:${bundle.id}`,
          label: `shared bundle: ${bundle.name}`,
        });
      }
      // One tier's worth of score no matter how many bundles are shared: extra
      // bundles add reason chips, never extra rank.
      if (sharedBundles.length) {
        score += WEIGHT.bundle;
      }
    }

    const candidateTagIds = tagIdsByAsset.get(candidate.id);
    if (candidateTagIds) {
      const sharedTagNames = [...currentTagIds]
        .filter((tagId) => candidateTagIds.has(tagId))
        .map((tagId) => tagsById.get(tagId)?.name)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b));
      if (sharedTagNames.length) {
        reasons.push({
          key: "tags",
          label: `shared tags: ${sharedTagNames.join(", ")}`,
        });
        // One tier's worth of score no matter how many tags are shared.
        score += WEIGHT.tag;
      }
    }

    if (owner && candidate.ownerId === owner.id) {
      reasons.push({ key: "owner", label: `same owner: ${owner.name}` });
      score += WEIGHT.owner;
    }

    if (origin && candidate.originId === origin.id) {
      reasons.push({ key: "origin", label: `same origin: ${origin.name}` });
      score += WEIGHT.origin;
    }

    if (candidate.type === asset.type) {
      reasons.push({ key: "type", label: `same type: ${asset.type}` });
      score += WEIGHT.type;
    }

    if (reasons.length) {
      results.push({ asset: candidate, score, reasons });
    }
  }

  return results.sort(
    (a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name),
  );
}

/**
 * Filters an already-ranked related-assets list by a free-text query, matching
 * against the candidate's name, slug, type, and every visible relationship reason.
 * An empty (or whitespace-only) query returns the list unchanged.
 */
export function filterRelatedAssets(
  related: RelatedAssetViewModel[],
  query: string,
): RelatedAssetViewModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return related;
  return related.filter((item) => {
    const haystack = [
      item.asset.name,
      item.asset.slug,
      item.asset.type,
      ...item.reasons.map((reason) => reason.label),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
