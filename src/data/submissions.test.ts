import { describe, expect, it } from "vitest";

import { contentHashOf } from "./hash";
import {
  catalogByTypeSlug,
  classifyStagedAsset,
  submissionContentHash,
} from "./submissions";
import type { AssetRow, SubmissionItemRow, VaultDataset } from "./types";

function assetRow(over: Partial<AssetRow> = {}): AssetRow {
  const type = over.type ?? "skill";
  const body = over.body ?? "hello";
  return {
    id: over.id ?? "as-1",
    tenantId: "tenant-x",
    type,
    name: over.name ?? "Sample",
    slug: over.slug ?? "sample",
    description: "",
    body,
    version: "1.0.0",
    status: "active",
    riskLevel: "low",
    maturity: 0.5,
    tier: "custom",
    contentHash: contentHashOf(type, body),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function datasetWith(assets: AssetRow[]): VaultDataset {
  return {
    routingStats: [],
    assets,
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
    assetRevisions: [],
    evalResults: [],
    baselines: [],
    interventions: [],
    utilization: [],
  };
}

describe("classifyStagedAsset dedup verdict", () => {
  it("is new when no catalog asset shares the (type, slug)", () => {
    const index = catalogByTypeSlug(datasetWith([assetRow({ slug: "alpha" })]));
    const staged = assetRow({ id: "stage", slug: "beta" });
    expect(classifyStagedAsset(index, staged)).toEqual({ verdict: "new" });
  });

  it("is duplicate when (type, slug) matches and the contentHash is identical", () => {
    const existing = assetRow({ id: "as-keep", slug: "shared", body: "same" });
    const index = catalogByTypeSlug(datasetWith([existing]));
    const staged = assetRow({ id: "stage", slug: "shared", body: "same" });
    expect(classifyStagedAsset(index, staged)).toEqual({
      verdict: "duplicate",
      duplicateAssetId: "as-keep",
    });
  });

  it("is conflict when (type, slug) matches but the body differs", () => {
    const existing = assetRow({ id: "as-keep", slug: "shared", body: "old" });
    const index = catalogByTypeSlug(datasetWith([existing]));
    const staged = assetRow({ id: "stage", slug: "shared", body: "new" });
    expect(classifyStagedAsset(index, staged)).toEqual({
      verdict: "conflict",
      duplicateAssetId: "as-keep",
    });
  });

  it("uses (type, slug) so a same-slug different-type asset stays new", () => {
    const index = catalogByTypeSlug(
      datasetWith([assetRow({ id: "as-skill", type: "skill", slug: "x" })]),
    );
    const staged = assetRow({ id: "stage", type: "prompt", slug: "x" });
    expect(classifyStagedAsset(index, staged)).toEqual({ verdict: "new" });
  });
});

describe("catalogByTypeSlug", () => {
  it("prefers the telemetry-bearing overlay (cc-) id as the dedup target", () => {
    const overlay = assetRow({ id: "cc-skill-x", slug: "x", body: "b" });
    const seed = assetRow({ id: "seed-skill-x", slug: "x", body: "b" });
    // Seed listed first, so a naive first-wins would pick the seed id.
    const index = catalogByTypeSlug(datasetWith([seed, overlay]));
    expect(index.get("skill::x")?.id).toBe("cc-skill-x");
  });
});

describe("submissionContentHash", () => {
  const item = (over: Partial<SubmissionItemRow>): SubmissionItemRow => ({
    id: "i",
    tenantId: "t",
    submissionId: "s",
    assetId: "a",
    assetName: "A",
    assetType: "skill",
    assetSlug: "a",
    description: "",
    body: "b",
    version: "1.0.0",
    assetStatus: "active",
    riskLevel: "low",
    maturity: 0.5,
    tier: "custom",
    contentHash: contentHashOf("skill", "b"),
    tagIds: [],
    dedupVerdict: "new",
    decision: "pending",
    ...over,
  });

  it("is stable regardless of item order", () => {
    const a = item({ assetSlug: "a", contentHash: "1" });
    const b = item({ assetSlug: "b", contentHash: "2" });
    expect(submissionContentHash([a, b])).toBe(submissionContentHash([b, a]));
  });

  it("changes when a staged body (contentHash) changes", () => {
    const before = submissionContentHash([item({ contentHash: "1" })]);
    const after = submissionContentHash([item({ contentHash: "2" })]);
    expect(before).not.toBe(after);
  });
});
