import { beforeEach, describe, expect, it } from "vitest";

import { parseContribution } from "./contribute/normalize";
import { effectiveAssetRate, duplicateClusters } from "./metrics";
import { SeedDataSource } from "./SeedDataSource";
import { catalogByTypeSlug } from "./submissions";

const meta = { submittedByOwnerId: "own-contrib" };

const newUpload = parseContribution(
  JSON.stringify({
    assets: [
      {
        type: "skill",
        name: "Zeta New Skill",
        slug: "zeta-new-skill",
        body: "a brand new body",
      },
    ],
  }),
);

describe("SeedDataSource submission store", () => {
  beforeEach(() => localStorage.clear());

  it("submitProjection leaves the dataset and key metrics unchanged", async () => {
    const ds = new SeedDataSource();
    const before = await ds.getDataset();
    const rateBefore = effectiveAssetRate(before);
    const dupClustersBefore = duplicateClusters(before).length;

    await ds.submitProjection(newUpload, meta);

    const after = await ds.getDataset();
    expect(after).toEqual(before);
    expect(effectiveAssetRate(after)).toBe(rateBefore);
    expect(duplicateClusters(after).length).toBe(dupClustersBefore);
    // Nothing persisted to the dataset key for a fresh instance either.
    expect(await new SeedDataSource().getDataset()).toEqual(before);
  });

  it("stores a submission with submitted status and staged items", async () => {
    const ds = new SeedDataSource();
    const submission = await ds.submitProjection(newUpload, meta);
    expect(submission.status).toBe("submitted");
    expect(submission.itemCount).toBe(1);
    expect(submission.submittedByOwnerId).toBe("own-contrib");

    const list = await ds.listSubmissions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(submission.id);

    const detail = await ds.getSubmission(submission.id);
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].assetSlug).toBe("zeta-new-skill");
    expect(detail.items[0].dedupVerdict).toBe("new");
    expect(detail.items[0].decision).toBe("pending");
  });

  it("flags a staged asset that matches an existing catalog row as duplicate", async () => {
    const ds = new SeedDataSource();
    const dataset = await ds.getDataset();
    // Pick the dedup target the catalog index would resolve, so the body matches.
    const target = [...catalogByTypeSlug(dataset).values()][0];
    const dupUpload = parseContribution(
      JSON.stringify({
        assets: [
          {
            type: target.type,
            name: target.name,
            slug: target.slug,
            body: target.body,
          },
        ],
      }),
    );
    const submission = await ds.submitProjection(dupUpload, meta);
    const detail = await ds.getSubmission(submission.id);
    expect(detail.items[0].dedupVerdict).toBe("duplicate");
    expect(detail.items[0].duplicateAssetId).toBe(target.id);
  });

  it("persists submissions across instances and reset clears them", async () => {
    const ds = new SeedDataSource();
    await ds.submitProjection(newUpload, meta);
    expect(await new SeedDataSource().listSubmissions()).toHaveLength(1);

    await ds.reset();
    expect(await new SeedDataSource().listSubmissions()).toHaveLength(0);
  });
});
