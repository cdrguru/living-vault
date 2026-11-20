import { describe, expect, it } from "vitest";

import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import {
  applyDecisions,
  assembleAcceptedProjection,
  buildSubmission,
  finalizeSubmission,
} from "./submissions";
import type {
  AssetRow,
  OriginRow,
  OwnerRow,
  SubmissionItemRow,
  SubmissionRow,
  TagRow,
  VaultDataset,
} from "./types";

function assetRow(over: Partial<AssetRow> = {}): AssetRow {
  const type = over.type ?? "skill";
  const body = over.body ?? "hello";
  return {
    id: over.id ?? "as-1",
    tenantId: "t",
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

const EMPTY: VaultDataset = {
  routingStats: [],
  assets: [],
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

function projection(
  assets: AssetRow[],
  assetTags: { assetId: string; tagId: string }[] = [],
): ProjectionInput {
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

const buildOpts = {
  submissionId: "S",
  tenantId: "T",
  now: "2026-06-19T00:00:00.000Z",
  submittedByOwnerId: "own-1",
  originId: "org-1",
  note: "please review",
};

describe("buildSubmission", () => {
  it("stages every incoming asset with a dedup verdict and deterministic ids", () => {
    const catalog: VaultDataset = {
      ...EMPTY,
      assets: [assetRow({ id: "as-keep", slug: "shared", body: "same" })],
    };
    const incoming = projection([
      assetRow({ id: "in-new", slug: "fresh" }),
      assetRow({ id: "in-dup", slug: "shared", body: "same" }),
    ]);

    const { submission, items } = buildSubmission(catalog, incoming, buildOpts);

    expect(submission.id).toBe("S");
    expect(submission.status).toBe("submitted");
    expect(submission.itemCount).toBe(2);
    expect(submission.submittedAt).toBe(buildOpts.now);
    expect(submission.submittedByOwnerId).toBe("own-1");
    expect(submission.note).toBe("please review");
    expect(items.map((i) => i.id)).toEqual(["S-item-0", "S-item-1"]);
    expect(items[0].dedupVerdict).toBe("new");
    expect(items[1].dedupVerdict).toBe("duplicate");
  });

  it("mints item ids through the injected minter when provided", () => {
    const incoming = projection([
      assetRow({ id: "in-a", slug: "a" }),
      assetRow({ id: "in-b", slug: "b" }),
    ]);
    let n = 0;
    const { items } = buildSubmission(EMPTY, incoming, {
      ...buildOpts,
      mintItemId: () => `uuid-${(n += 1)}`,
    });
    expect(items.map((i) => i.id)).toEqual(["uuid-1", "uuid-2"]);
  });

  it("counts conflicts and carries the upload's tag associations", () => {
    const catalog: VaultDataset = {
      ...EMPTY,
      assets: [assetRow({ id: "as-old", slug: "shared", body: "old" })],
    };
    const incoming = projection(
      [assetRow({ id: "in-conf", slug: "shared", body: "new" })],
      [{ assetId: "in-conf", tagId: "tag-x" }],
    );

    const { submission, items } = buildSubmission(catalog, incoming, buildOpts);

    expect(items[0].dedupVerdict).toBe("conflict");
    expect(submission.conflictCount).toBe(1);
    expect(items[0].tagIds).toEqual(["tag-x"]);
  });
});

function item(over: Partial<SubmissionItemRow> = {}): SubmissionItemRow {
  return {
    id: "i1",
    tenantId: "T",
    submissionId: "S",
    assetId: "as-1",
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
  };
}

describe("applyDecisions", () => {
  it("applies a decision and note without mutating the input", () => {
    const items = [item({ id: "i1" }), item({ id: "i2" })];
    const result = applyDecisions(items, [
      { itemId: "i1", decision: "accept", reviewerNote: "good" },
    ]);

    expect(result[0].decision).toBe("accept");
    expect(result[0].reviewerNote).toBe("good");
    expect(result[1].decision).toBe("pending");
    // input untouched (pure)
    expect(items[0].decision).toBe("pending");
  });
});

describe("assembleAcceptedProjection", () => {
  const owners: OwnerRow[] = [
    { id: "own-1", tenantId: "T", name: "O", email: "o@x.com", role: "author" },
  ];
  const origins: OriginRow[] = [
    { id: "org-1", tenantId: "T", name: "R", kind: "repo" },
  ];
  const tags: TagRow[] = [
    { id: "tag-x", tenantId: "T", kind: "capability", name: "X" },
  ];
  const catalog: VaultDataset = { ...EMPTY, owners, origins, tags };

  it("mints the asset id, recomputes the hash, and stamps resolvable owner/origin", () => {
    const out = assembleAcceptedProjection(
      catalog,
      { submittedByOwnerId: "own-1", originId: "org-1" },
      [item({ id: "i1", body: "fresh", tagIds: ["tag-x", "tag-unknown"] })],
      { tenantId: "T", now: "N", mintAssetId: () => "minted-1" },
    );

    expect(out.assets[0].id).toBe("minted-1");
    expect(out.assets[0].ownerId).toBe("own-1");
    expect(out.assets[0].originId).toBe("org-1");
    expect(out.assets[0].contentHash).toBe(contentHashOf("skill", "fresh"));
    // tagId carried only when it exists in the catalog, linked to the minted id
    expect(out.assetTags).toEqual([{ assetId: "minted-1", tagId: "tag-x" }]);
  });

  it("leaves owner and origin unstamped when they do not resolve", () => {
    const out = assembleAcceptedProjection(
      catalog,
      { submittedByOwnerId: "ghost", originId: "nope" },
      [item({ id: "i1" })],
      { tenantId: "T", now: "N", mintAssetId: (i) => `id-${i.id}` },
    );
    expect(out.assets[0].ownerId).toBeUndefined();
    expect(out.assets[0].originId).toBeUndefined();
  });
});

describe("finalizeSubmission", () => {
  const base: SubmissionRow = {
    id: "S",
    tenantId: "T",
    submittedByOwnerId: "own-1",
    status: "submitted",
    itemCount: 2,
    acceptedCount: 0,
    rejectedCount: 0,
    conflictCount: 0,
    contentHash: "h",
    submittedAt: "N",
    note: "original",
  };

  it("sets counts, status, and reviewer metadata, preserving note when absent", () => {
    const out = finalizeSubmission(
      base,
      [
        item({ id: "i1", decision: "accept" }),
        item({ id: "i2", decision: "reject" }),
      ],
      { reviewedByOwnerId: "rev", reviewedAt: "T2" },
    );
    expect(out.status).toBe("accepted");
    expect(out.acceptedCount).toBe(1);
    expect(out.rejectedCount).toBe(1);
    expect(out.reviewedByOwnerId).toBe("rev");
    expect(out.reviewedAt).toBe("T2");
    expect(out.note).toBe("original");
  });

  it("requests changes when an item is left to refine", () => {
    const out = finalizeSubmission(
      base,
      [item({ id: "i1", decision: "refine" })],
      { reviewedByOwnerId: "rev", reviewedAt: "T2", note: "needs work" },
    );
    expect(out.status).toBe("changes_requested");
    expect(out.note).toBe("needs work");
  });
});
