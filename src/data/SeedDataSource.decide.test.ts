import { beforeEach, describe, expect, it } from "vitest";

import type { SubmissionMeta } from "./DataSource";
import { parseContribution } from "./contribute/normalize";
import { SeedDataSource } from "./SeedDataSource";

// Basic accept/reject/re-accept/transition behavior is covered for this backend
// (and the HTTP/SQLite one) by DataSource.parity.test.ts. This file keeps only the
// SeedDataSource-specific edges: reviewer stamping, mixed-decision counts,
// unresolved owner/origin, and staged tagId round-trip.

const review = { reviewedByOwnerId: "own-admin" };

function uploadOf(over: Record<string, unknown>) {
  return parseContribution(
    JSON.stringify({
      assets: [{ type: "skill", body: "a body", ...over }],
    }),
  );
}

async function submitOne(
  ds: SeedDataSource,
  over: Record<string, unknown>,
  meta: SubmissionMeta = { submittedByOwnerId: "own-contrib" },
) {
  const submission = await ds.submitProjection(uploadOf(over), meta);
  const detail = await ds.getSubmission(submission.id);
  return { submission, items: detail.items };
}

describe("SeedDataSource.decideSubmission", () => {
  beforeEach(() => localStorage.clear());

  it("accept imports accepted items through importProjection and stamps the reviewer", async () => {
    const ds = new SeedDataSource();
    const before = (await ds.getDataset()).assets.length;
    const { submission, items } = await submitOne(ds, {
      name: "Accept Me",
      slug: "accept-me",
    });

    const result = await ds.decideSubmission(
      submission.id,
      [{ itemId: items[0].id, decision: "accept" }],
      review,
    );

    const after = await ds.getDataset();
    expect(after.assets.find((a) => a.slug === "accept-me")).toBeDefined();
    expect(after.assets.length).toBe(before + 1);
    expect(result.added).toBe(1);
    const decided = await ds.getSubmission(submission.id);
    expect(decided.submission.status).toBe("accepted");
    expect(decided.submission.acceptedCount).toBe(1);
    expect(decided.submission.reviewedByOwnerId).toBe("own-admin");
    expect(decided.submission.reviewedAt).toBeTruthy();
  });

  it("mixed accept and reject updates status and counts", async () => {
    const ds = new SeedDataSource();
    const submission = await ds.submitProjection(
      parseContribution(
        JSON.stringify({
          assets: [
            { type: "skill", name: "Keep", slug: "keep-one", body: "k" },
            { type: "skill", name: "Drop", slug: "drop-one", body: "d" },
          ],
        }),
      ),
      { submittedByOwnerId: "own-contrib" },
    );
    const items = (await ds.getSubmission(submission.id)).items;
    const keep = items.find((i) => i.assetSlug === "keep-one")!;
    const drop = items.find((i) => i.assetSlug === "drop-one")!;

    await ds.decideSubmission(
      submission.id,
      [
        { itemId: keep.id, decision: "accept" },
        { itemId: drop.id, decision: "reject" },
      ],
      review,
    );

    const after = await ds.getDataset();
    expect(after.assets.find((a) => a.slug === "keep-one")).toBeDefined();
    expect(after.assets.find((a) => a.slug === "drop-one")).toBeUndefined();
    const decided = await ds.getSubmission(submission.id);
    expect(decided.submission.status).toBe("accepted");
    expect(decided.submission.acceptedCount).toBe(1);
    expect(decided.submission.rejectedCount).toBe(1);
  });

  it("leaves owner unstamped (and does not break) when it cannot resolve", async () => {
    const ds = new SeedDataSource();
    const { submission, items } = await submitOne(
      ds,
      { name: "Ghost Owned", slug: "ghost-owned" },
      { submittedByOwnerId: "own-does-not-exist", originId: "org-nope" },
    );

    await ds.decideSubmission(
      submission.id,
      [{ itemId: items[0].id, decision: "accept" }],
      review,
    );

    const imported = (await ds.getDataset()).assets.find(
      (a) => a.slug === "ghost-owned",
    );
    expect(imported).toBeDefined();
    expect(imported?.ownerId).toBeUndefined();
    expect(imported?.originId).toBeUndefined();
  });

  it("preserves staged tagIds that map to a catalog tag on accept", async () => {
    const ds = new SeedDataSource();
    const tagId = (await ds.getDataset()).tags[0].id;
    const upload = parseContribution(
      JSON.stringify({
        tags: [{ id: tagId, name: "Carried", kind: "capability" }],
        assets: [
          {
            id: "up-tagged",
            type: "skill",
            name: "Tagged",
            slug: "tagged-new",
            body: "t",
          },
        ],
        assetTags: [{ assetId: "up-tagged", tagId }],
      }),
    );
    const submission = await ds.submitProjection(upload, {
      submittedByOwnerId: "own-contrib",
    });
    const items = (await ds.getSubmission(submission.id)).items;
    expect(items[0].tagIds).toContain(tagId);

    await ds.decideSubmission(
      submission.id,
      [{ itemId: items[0].id, decision: "accept" }],
      review,
    );

    const after = await ds.getDataset();
    const imported = after.assets.find((a) => a.slug === "tagged-new")!;
    expect(
      after.assetTags.some(
        (t) => t.assetId === imported.id && t.tagId === tagId,
      ),
    ).toBe(true);
  });
});
