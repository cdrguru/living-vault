import { describe, expect, it } from "vitest";

import type {
  AssetRow,
  BundleRow,
  OriginRow,
  OwnerRow,
  TagRow,
  VaultDataset,
} from "@/data/types";

import {
  filterRelatedAssets,
  getRelatedAssets,
  type RelatedAssetViewModel,
} from "./relatedAssets";

const TENANT = "tenant-test";

const mkAsset = (over: Partial<AssetRow> & Pick<AssetRow, "id">): AssetRow => ({
  tenantId: TENANT,
  type: "skill",
  name: over.id,
  slug: over.id,
  description: "A governed asset.",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.8,
  tier: "stock",
  contentHash: `hash-${over.id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  ...over,
});

const owners: OwnerRow[] = [
  {
    id: "own-1",
    tenantId: TENANT,
    name: "Paul Davis",
    email: "paul@x.io",
    role: "maintainer",
  },
  {
    id: "own-2",
    tenantId: TENANT,
    name: "Someone Else",
    email: "else@x.io",
    role: "author",
  },
];

const origins: OriginRow[] = [
  { id: "org-1", tenantId: TENANT, name: "the-fabric-library", kind: "repo" },
  { id: "org-2", tenantId: TENANT, name: "other-origin", kind: "local" },
];

const bundles: BundleRow[] = [
  { id: "b1", tenantId: TENANT, name: "Fabric ops", description: "" },
];

// Six bundles current and manyBundlesMate both belong to, so a many-bundles
// match can be checked against the reverse-dependency tier above it.
const manyBundles: BundleRow[] = Array.from({ length: 6 }, (_, i) => ({
  id: `mb${i + 1}`,
  tenantId: TENANT,
  name: `Many Bundle ${i + 1}`,
  description: "",
}));

const tags: TagRow[] = [
  { id: "t-quality", tenantId: TENANT, kind: "capability", name: "quality" },
  { id: "t-devops", tenantId: TENANT, kind: "domain", name: "devops" },
];

// Fifteen tags current and manyTagsMate both carry, so a many-tags match can
// be checked against the shared-bundle tier above it.
const manyTags: TagRow[] = Array.from({ length: 15 }, (_, i) => ({
  id: `mt${i + 1}`,
  tenantId: TENANT,
  kind: "capability",
  name: `many-tag-${i + 1}`,
}));

// "current" is the asset whose detail page is open. Each other fixture asset is
// built to isolate exactly one relationship signal, so each test can assert on a
// single reason without any other signal leaking score into it.
const current = mkAsset({
  id: "current",
  type: "skill",
  ownerId: "own-1",
  originId: "org-1",
});

// current depends on this one (outbound edge): it is a dependency of current.
const depRequired = mkAsset({ id: "dep-required", type: "prompt" });
// this one depends on current (inbound edge): it is a dependent of current.
const depRequiredBy = mkAsset({ id: "dep-required-by", type: "mcp-server" });
// shares only a bundle with current.
const bundleMate = mkAsset({ id: "bundle-mate", type: "hook" });
// shares only tags with current.
const tagMate = mkAsset({ id: "tag-mate", type: "command" });
// shares only an owner with current.
const ownerMate = mkAsset({
  id: "owner-mate",
  type: "command",
  ownerId: "own-1",
});
// shares only an origin with current.
const originMate = mkAsset({
  id: "origin-mate",
  type: "workflow",
  originId: "org-1",
});
// shares only the asset type with current.
const typeMate = mkAsset({ id: "type-mate", type: "skill" });
// shares a bundle AND a tag with current, so its score should accumulate.
const bundleAndTagMate = mkAsset({
  id: "bundle-and-tag-mate",
  type: "workflow",
});
// shares nothing with current at all.
const unrelated = mkAsset({
  id: "unrelated",
  type: "workflow",
  ownerId: "own-2",
  originId: "org-2",
});
// shares all 15 manyTags with current, and nothing else. Used to prove a large
// tag overlap can never outrank a single shared bundle.
const manyTagsMate = mkAsset({ id: "many-tags-mate", type: "workflow" });
// shares all 6 manyBundles with current, and nothing else. Used to prove a
// large bundle overlap can never outrank a reverse dependency edge.
const manyBundlesMate = mkAsset({ id: "many-bundles-mate", type: "workflow" });

const dataset: VaultDataset = {
  assets: [
    current,
    depRequired,
    depRequiredBy,
    bundleMate,
    tagMate,
    ownerMate,
    originMate,
    typeMate,
    bundleAndTagMate,
    unrelated,
    manyTagsMate,
    manyBundlesMate,
  ],
  tags: [...tags, ...manyTags],
  origins,
  owners,
  bundles: [...bundles, ...manyBundles],
  assetTags: [
    { assetId: current.id, tagId: "t-quality" },
    { assetId: current.id, tagId: "t-devops" },
    { assetId: tagMate.id, tagId: "t-quality" },
    { assetId: tagMate.id, tagId: "t-devops" },
    { assetId: bundleAndTagMate.id, tagId: "t-quality" },
    ...manyTags.map((tag) => ({ assetId: current.id, tagId: tag.id })),
    ...manyTags.map((tag) => ({ assetId: manyTagsMate.id, tagId: tag.id })),
  ],
  dependencies: [
    { assetId: current.id, dependsOnAssetId: depRequired.id },
    { assetId: depRequiredBy.id, dependsOnAssetId: current.id },
  ],
  bundleMemberships: [
    { bundleId: "b1", assetId: current.id },
    { bundleId: "b1", assetId: bundleMate.id },
    { bundleId: "b1", assetId: bundleAndTagMate.id },
    ...manyBundles.map((bundle) => ({
      bundleId: bundle.id,
      assetId: current.id,
    })),
    ...manyBundles.map((bundle) => ({
      bundleId: bundle.id,
      assetId: manyBundlesMate.id,
    })),
  ],
  evalResults: [],
  utilization: [],
};

describe("getRelatedAssets", () => {
  it("never includes the current asset itself", () => {
    const related = getRelatedAssets(dataset, current.id);
    expect(related.some((item) => item.asset.id === current.id)).toBe(false);
  });

  it("excludes assets that share no signal with the current asset", () => {
    const related = getRelatedAssets(dataset, current.id);
    expect(related.some((item) => item.asset.id === unrelated.id)).toBe(false);
  });

  it("returns an empty array for an unknown asset id", () => {
    expect(getRelatedAssets(dataset, "ghost")).toEqual([]);
  });

  it("ranks a direct dependency above a weaker same-type-only match", () => {
    const related = getRelatedAssets(dataset, current.id);
    const required = related.find((item) => item.asset.id === depRequired.id)!;
    const sameType = related.find((item) => item.asset.id === typeMate.id)!;
    expect(required).toBeDefined();
    expect(sameType).toBeDefined();
    expect(required.score).toBeGreaterThan(sameType.score);
    expect(related.indexOf(required)).toBeLessThan(related.indexOf(sameType));
  });

  it("labels a candidate the current asset requires as its dependency", () => {
    const related = getRelatedAssets(dataset, current.id);
    const required = related.find((item) => item.asset.id === depRequired.id)!;
    expect(required.reasons.map((r) => r.label)).toContain(
      "a dependency of this asset",
    );
  });

  it("includes the reverse dependency edge, labeled distinctly from the direct edge", () => {
    const related = getRelatedAssets(dataset, current.id);
    const requiredBy = related.find(
      (item) => item.asset.id === depRequiredBy.id,
    )!;
    expect(requiredBy).toBeDefined();
    expect(requiredBy.reasons.map((r) => r.label)).toContain(
      "depends on this asset",
    );
  });

  it("ranks a direct dependency above the reverse dependency", () => {
    const related = getRelatedAssets(dataset, current.id);
    const required = related.find((item) => item.asset.id === depRequired.id)!;
    const requiredBy = related.find(
      (item) => item.asset.id === depRequiredBy.id,
    )!;
    expect(required.score).toBeGreaterThan(requiredBy.score);
  });

  it("produces a shared-bundle reason naming the bundle", () => {
    const related = getRelatedAssets(dataset, current.id);
    const match = related.find((item) => item.asset.id === bundleMate.id)!;
    expect(match.reasons.map((r) => r.label)).toContain(
      "shared bundle: Fabric ops",
    );
  });

  it("produces one shared-tags reason naming every shared tag", () => {
    const related = getRelatedAssets(dataset, current.id);
    const match = related.find((item) => item.asset.id === tagMate.id)!;
    expect(match.reasons.map((r) => r.label)).toContain(
      "shared tags: devops, quality",
    );
  });

  it("names the owner and origin in their reasons", () => {
    const related = getRelatedAssets(dataset, current.id);
    const owner = related.find((item) => item.asset.id === ownerMate.id)!;
    const origin = related.find((item) => item.asset.id === originMate.id)!;
    expect(owner.reasons.map((r) => r.label)).toContain(
      "same owner: Paul Davis",
    );
    expect(origin.reasons.map((r) => r.label)).toContain(
      "same origin: the-fabric-library",
    );
  });

  it("names the shared type in its reason", () => {
    const related = getRelatedAssets(dataset, current.id);
    const match = related.find((item) => item.asset.id === typeMate.id)!;
    expect(match.reasons.map((r) => r.label)).toContain("same type: skill");
  });

  it("ranks a bundle-only match above a same-type-only match", () => {
    const related = getRelatedAssets(dataset, current.id);
    const bundleOnly = related.find((item) => item.asset.id === bundleMate.id)!;
    const sameType = related.find((item) => item.asset.id === typeMate.id)!;
    expect(bundleOnly.score).toBeGreaterThan(sameType.score);
  });

  it("accumulates score across multiple matched signals on the same candidate", () => {
    const related = getRelatedAssets(dataset, current.id);
    const bundleOnly = related.find((item) => item.asset.id === bundleMate.id)!;
    const bundleAndTag = related.find(
      (item) => item.asset.id === bundleAndTagMate.id,
    )!;
    expect(bundleAndTag.score).toBeGreaterThan(bundleOnly.score);
    expect(bundleAndTag.reasons.length).toBeGreaterThan(1);
  });

  it("never lets a large tag overlap outrank a single shared bundle", () => {
    // Regression: tag score must not scale with the number of shared tags, or
    // enough shared tags (here, 15) could out-score a stronger bundle tier.
    const related = getRelatedAssets(dataset, current.id);
    const manyTags = related.find((item) => item.asset.id === manyTagsMate.id)!;
    const bundleOnly = related.find((item) => item.asset.id === bundleMate.id)!;
    expect(manyTags.score).toBeLessThan(bundleOnly.score);
  });

  it("never lets a large bundle overlap outrank a reverse dependency", () => {
    // Regression: bundle score must not scale with the number of shared
    // bundles, or enough shared bundles (here, 6) could out-score requiredBy.
    const related = getRelatedAssets(dataset, current.id);
    const manyBundles = related.find(
      (item) => item.asset.id === manyBundlesMate.id,
    )!;
    const requiredBy = related.find(
      (item) => item.asset.id === depRequiredBy.id,
    )!;
    expect(manyBundles.score).toBeLessThan(requiredBy.score);
  });
});

describe("filterRelatedAssets", () => {
  const mkRelated = (
    over: Partial<AssetRow> & Pick<AssetRow, "id">,
    reasonLabels: string[],
  ): RelatedAssetViewModel => ({
    asset: mkAsset(over),
    score: 1,
    reasons: reasonLabels.map((label, i) => ({
      key: `${over.id}-${i}`,
      label,
    })),
  });

  const fixture: RelatedAssetViewModel[] = [
    mkRelated(
      {
        id: "alpha-skill",
        name: "Alpha Skill",
        slug: "alpha-skill",
        type: "skill",
      },
      ["requires this asset"],
    ),
    mkRelated(
      {
        id: "beta-prompt",
        name: "Beta Prompt",
        slug: "beta-prompt",
        type: "prompt",
      },
      ["shared bundle: Fabric ops"],
    ),
    mkRelated(
      {
        id: "gamma-hook",
        name: "Gamma Hook",
        slug: "gamma-hook",
        type: "hook",
      },
      ["same owner: Paul Davis"],
    ),
  ];

  it("returns every item unchanged for an empty query", () => {
    expect(filterRelatedAssets(fixture, "")).toEqual(fixture);
    expect(filterRelatedAssets(fixture, "   ")).toEqual(fixture);
  });

  it("matches by asset name, case-insensitively", () => {
    const result = filterRelatedAssets(fixture, "alpha");
    expect(result.map((item) => item.asset.id)).toEqual(["alpha-skill"]);
  });

  it("matches by asset slug", () => {
    const result = filterRelatedAssets(fixture, "beta-prompt");
    expect(result.map((item) => item.asset.id)).toEqual(["beta-prompt"]);
  });

  it("matches by asset type", () => {
    const result = filterRelatedAssets(fixture, "hook");
    expect(result.map((item) => item.asset.id)).toEqual(["gamma-hook"]);
  });

  it("matches by relationship reason text", () => {
    const result = filterRelatedAssets(fixture, "Fabric ops");
    expect(result.map((item) => item.asset.id)).toEqual(["beta-prompt"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterRelatedAssets(fixture, "nothing matches this query")).toEqual(
      [],
    );
  });
});
