import { describe, expect, it } from "vitest";

import { runDataSourceContract } from "../contract";
import { contentHashOf } from "../hash";
import { mergeProjection } from "../merge";
import type { OwnerRow, VaultDataset } from "../types";
import {
  ContributionError,
  normalizeContribution,
  parseContribution,
} from "./normalize";

const EMPTY: VaultDataset = {
  assets: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [],
};

function asset(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "skill",
    name: "My Skill",
    slug: "my-skill",
    body: "hello",
    ...over,
  };
}

/** A normalized upload must be coherent once merged into the vault. */
function contractAfterMerge(
  projection: Parameters<typeof mergeProjection>[1],
): string[] {
  return runDataSourceContract(mergeProjection(EMPTY, projection, "tenant-x"));
}

describe("normalizeContribution", () => {
  it("normalizes a bare asset array into a contract-clean projection", () => {
    const projection = normalizeContribution([asset()]);
    expect(projection.assets).toHaveLength(1);
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("recomputes contentHash from type and body, ignoring the uploaded value", () => {
    const projection = normalizeContribution([asset({ contentHash: "WRONG" })]);
    expect(projection.assets[0].contentHash).toBe(
      contentHashOf("skill", "hello"),
    );
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("throws ContributionError on an unknown asset type", () => {
    expect(() => normalizeContribution([asset({ type: "bogus" })])).toThrow(
      ContributionError,
    );
  });

  it("throws ContributionError when there are no assets", () => {
    expect(() => normalizeContribution({ assets: [] })).toThrow(
      ContributionError,
    );
  });

  it("drops dangling join rows and unresolved owner/origin refs", () => {
    const projection = normalizeContribution({
      assets: [asset({ id: "a1", ownerId: "owner-x", originId: "origin-x" })],
      assetTags: [
        { assetId: "a1", tagId: "missing" },
        { assetId: "ghost", tagId: "t1" },
      ],
      dependencies: [{ assetId: "a1", dependsOnAssetId: "ghost" }],
    });
    expect(projection.assetTags).toHaveLength(0);
    expect(projection.dependencies).toHaveLength(0);
    expect(projection.assets[0].ownerId).toBeUndefined();
    expect(projection.assets[0].originId).toBeUndefined();
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("keeps a join row when both ends resolve within the upload", () => {
    const projection = normalizeContribution({
      assets: [asset({ id: "a1" })],
      tags: [{ id: "t1", name: "Quality" }],
      assetTags: [{ assetId: "a1", tagId: "t1" }],
    });
    expect(projection.assetTags).toHaveLength(1);
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("stamps the contributor ownerId and injects the owner so it resolves", () => {
    const owner: OwnerRow = {
      id: "owner-me",
      tenantId: "ignored",
      name: "Me",
      email: "me@example.com",
      role: "author",
    };
    const projection = normalizeContribution([asset()], {
      ownerId: "owner-me",
      owner,
    });
    expect(projection.assets[0].ownerId).toBe("owner-me");
    expect(projection.owners.map((o) => o.id)).toContain("owner-me");
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("forces an uploaded owner's role to viewer so an upload cannot grant privilege", () => {
    const projection = normalizeContribution({
      assets: [asset()],
      owners: [
        { id: "owner-evil", name: "Evil", email: "evil@x.com", role: "admin" },
        { id: "owner-norole", name: "NoRole", email: "n@x.com" },
      ],
    });
    expect(projection.owners.map((o) => o.role)).toEqual(["viewer", "viewer"]);
  });

  it("satisfies the forked/stock stockVersion contract", () => {
    const forked = normalizeContribution([asset({ tier: "forked" })]);
    expect(typeof forked.assets[0].stockVersion).toBe("string");
    expect(contractAfterMerge(forked)).toEqual([]);

    // An empty-string stockVersion on a forked asset must still fall back and stay
    // contract-clean (the contract's !stockVersion check treats "" as missing).
    const forkedEmpty = normalizeContribution([
      asset({ tier: "forked", stockVersion: "" }),
    ]);
    expect(forkedEmpty.assets[0].stockVersion).toBe("1.0.0");
    expect(contractAfterMerge(forkedEmpty)).toEqual([]);

    const stock = normalizeContribution([
      asset({ tier: "stock", stockVersion: "9.9" }),
    ]);
    expect(stock.assets[0].stockVersion).toBeUndefined();
    expect(contractAfterMerge(stock)).toEqual([]);
  });

  it("normalizes an uploaded slug instead of passing it through verbatim", () => {
    const projection = normalizeContribution([
      asset({ slug: "Skill::Injected!" }),
    ]);
    expect(projection.assets[0].slug).not.toContain("::");
    expect(projection.assets[0].slug).toBe("skill-injected");
    expect(contractAfterMerge(projection)).toEqual([]);
  });

  it("rejects duplicate asset ids in one upload", () => {
    expect(() =>
      normalizeContribution([
        asset({ id: "dup" }),
        asset({ id: "dup", name: "Other" }),
      ]),
    ).toThrow(ContributionError);
  });

  it("rejects an upload that exceeds the asset cap", () => {
    const many = Array.from({ length: 5001 }, (_, i) =>
      asset({ id: `a${i}`, name: `A${i}`, slug: `a${i}` }),
    );
    expect(() => normalizeContribution(many)).toThrow(ContributionError);
  });

  it("rejects opts.ownerId without a matching opts.owner", () => {
    expect(() =>
      normalizeContribution([asset()], { ownerId: "owner-x" }),
    ).toThrow(ContributionError);
  });

  it("passes a full projection-shaped object through", () => {
    const projection = normalizeContribution({
      assets: [
        asset({ id: "a1" }),
        asset({ id: "a2", name: "Other", slug: "other" }),
      ],
      tags: [{ id: "t1", name: "Quality", kind: "capability" }],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [{ assetId: "a1", tagId: "t1" }],
      dependencies: [],
      bundleMemberships: [],
    });
    expect(projection.assets).toHaveLength(2);
    expect(projection.assetTags).toHaveLength(1);
    expect(contractAfterMerge(projection)).toEqual([]);
  });
});

describe("parseContribution", () => {
  it("throws ContributionError on invalid JSON", () => {
    expect(() => parseContribution("{ not json")).toThrow(ContributionError);
  });

  it("parses valid JSON and normalizes it", () => {
    const projection = parseContribution(JSON.stringify([asset()]));
    expect(projection.assets).toHaveLength(1);
    expect(contractAfterMerge(projection)).toEqual([]);
  });
});
