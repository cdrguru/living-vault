import { describe, expect, it } from "vitest";

import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import { RayfinDataSource, type RayfinReader } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";
import type { RayfinEntityName, RayfinWriter } from "./rayfinWriter";
import type { AssetRow, SubmissionItemRow, SubmissionRow } from "./types";

const CATALOG = {
  assets: [],
  tags: [],
  origins: [{ id: "g1", tenantId: "t", name: "repo", kind: "local" }],
  owners: [
    {
      id: "o1",
      tenantId: "t",
      name: "Lee",
      email: "lee@x.io",
      role: "maintainer",
    },
  ],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  utilization: [],
  evalResults: [],
} as unknown as RayfinEntities;

function stagedAsset(over: Partial<AssetRow> = {}): AssetRow {
  const type = over.type ?? "skill";
  const body = over.body ?? "b";
  return {
    id: over.id ?? "in-1",
    tenantId: "t",
    type,
    name: over.name ?? "Staged",
    slug: over.slug ?? "staged",
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

function projection(assets: AssetRow[]): ProjectionInput {
  return {
    assets,
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
  };
}

function seededSubmission(): SubmissionRow {
  return {
    id: "s1",
    tenantId: "t",
    submittedByOwnerId: "o1",
    status: "submitted",
    itemCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    conflictCount: 0,
    contentHash: "h",
    submittedAt: "2026-06-18T00:00:00.000Z",
  };
}

function seededItem(over: Partial<SubmissionItemRow> = {}): SubmissionItemRow {
  return {
    id: "s1-i1",
    tenantId: "t",
    submissionId: "s1",
    assetId: "in-1",
    assetName: "New Asset",
    assetType: "skill",
    assetSlug: "new-accept",
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

interface Call {
  op: "create" | "update" | "delete";
  entity: RayfinEntityName;
  data?: Record<string, unknown>;
  filter?: Record<string, unknown>;
}

class Backend implements RayfinReader, RayfinWriter {
  entities: RayfinEntities;
  submissions: SubmissionRow[];
  items: SubmissionItemRow[];
  calls: Call[] = [];
  private n = 0;

  constructor(
    seed: {
      submissions?: SubmissionRow[];
      items?: SubmissionItemRow[];
    } = {},
  ) {
    this.entities = structuredClone(CATALOG);
    this.submissions = structuredClone(seed.submissions ?? []);
    this.items = structuredClone(seed.items ?? []);
  }

  readAll(): Promise<RayfinEntities> {
    return Promise.resolve(structuredClone(this.entities));
  }

  readSubmissions(): Promise<{
    submissions: SubmissionRow[];
    items: SubmissionItemRow[];
  }> {
    return Promise.resolve({
      submissions: structuredClone(this.submissions),
      items: structuredClone(this.items),
    });
  }

  create(
    entity: RayfinEntityName,
    data: Record<string, unknown>,
  ): Promise<{ id: string }> {
    this.calls.push({ op: "create", entity, data });
    const id = (data.id as string | undefined) ?? `gen-${(this.n += 1)}`;
    return Promise.resolve({ id });
  }

  update(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.calls.push({ op: "update", entity, filter, data });
    return Promise.resolve();
  }

  delete(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
  ): Promise<void> {
    this.calls.push({ op: "delete", entity, filter });
    return Promise.resolve();
  }
}

const allow = { canReview: () => true };
const counterIds = () => {
  let n = 0;
  return () => `uuid-${(n += 1)}`;
};

describe("RayfinDataSource submissions", () => {
  it("submitProjection writes a Submission and item with minted uuids", async () => {
    const backend = new Backend();
    const source = new RayfinDataSource(backend, backend, {
      newId: counterIds(),
      ...allow,
    });

    const submission = await source.submitProjection(
      projection([stagedAsset({ slug: "fresh" })]),
      { submittedByOwnerId: "o1", originId: "g1" },
    );

    expect(submission.id).toBe("uuid-1");
    expect(submission.status).toBe("submitted");
    const creates = backend.calls.filter((c) => c.op === "create");
    expect(creates.map((c) => c.entity)).toEqual([
      "Submission",
      "SubmissionItem",
    ]);
    expect(creates[1].data?.id).toBe("uuid-2");
    expect(creates[1].data?.dedupVerdict).toBe("new");
  });

  it("listSubmissions and getSubmission read the submission tables", async () => {
    const backend = new Backend({
      submissions: [seededSubmission()],
      items: [seededItem()],
    });
    const source = new RayfinDataSource(backend, backend, allow);

    expect(await source.listSubmissions()).toHaveLength(1);
    const detail = await source.getSubmission("s1");
    expect(detail.submission.id).toBe("s1");
    expect(detail.items[0].assetSlug).toBe("new-accept");
  });

  it("decideSubmission accept routes through importProjection and finalizes", async () => {
    const backend = new Backend({
      submissions: [seededSubmission()],
      items: [seededItem()],
    });
    const source = new RayfinDataSource(backend, backend, {
      newId: counterIds(),
      ...allow,
    });

    const result = await source.decideSubmission(
      "s1",
      [{ itemId: "s1-i1", decision: "accept" }],
      { reviewedByOwnerId: "o1" },
    );

    expect(result.added).toBe(1);
    expect(
      backend.calls.some((c) => c.op === "create" && c.entity === "Asset"),
    ).toBe(true);
    const subUpdate = backend.calls.find(
      (c) => c.op === "update" && c.entity === "Submission",
    );
    expect(subUpdate?.data?.status).toBe("accepted");
  });

  it("decideSubmission reject leaves the catalog untouched", async () => {
    const backend = new Backend({
      submissions: [seededSubmission()],
      items: [seededItem()],
    });
    const source = new RayfinDataSource(backend, backend, allow);

    const result = await source.decideSubmission(
      "s1",
      [{ itemId: "s1-i1", decision: "reject" }],
      { reviewedByOwnerId: "o1" },
    );

    expect(result).toEqual({ added: 0, updated: 0 });
    expect(backend.calls.some((c) => c.entity === "Asset")).toBe(false);
    const subUpdate = backend.calls.find(
      (c) => c.op === "update" && c.entity === "Submission",
    );
    expect(subUpdate?.data?.status).toBe("rejected");
  });

  it("rejects review writes when no writer is injected", async () => {
    const backend = new Backend({
      submissions: [seededSubmission()],
      items: [seededItem()],
    });
    const readOnly = new RayfinDataSource(backend, undefined, allow);

    await expect(
      readOnly.submitProjection(projection([stagedAsset()]), {
        submittedByOwnerId: "o1",
      }),
    ).rejects.toThrow(/Fabric/);
    // reads still work without a writer
    expect(await readOnly.listSubmissions()).toHaveLength(1);
  });

  it("forbids decide when the reviewer is not authorized", async () => {
    const backend = new Backend({
      submissions: [seededSubmission()],
      items: [seededItem()],
    });
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => false,
    });

    await expect(
      source.decideSubmission("s1", [{ itemId: "s1-i1", decision: "accept" }], {
        reviewedByOwnerId: "o1",
      }),
    ).rejects.toThrow(/not authorized|forbidden|restricted|review/i);
  });
});
