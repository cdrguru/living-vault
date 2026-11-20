import { describe, expect, it } from "vitest";

import {
  assetCoherenceViolations,
  referentialIntegrityViolations,
  runDataSourceContract,
} from "./contract";
import { mergeProjection } from "./merge";
import { fabricLibraryProjection } from "./projection";
import { seedDataset, TENANT } from "./seed";

describe("contract", () => {
  it("the seed passes the full contract", () => {
    expect(runDataSourceContract(seedDataset)).toEqual([]);
  });

  it("flags a forked asset with no stockVersion", () => {
    const bad = structuredClone(seedDataset);
    bad.assets[0] = {
      ...bad.assets[0],
      tier: "forked",
      stockVersion: undefined,
    };
    expect(assetCoherenceViolations(bad.assets)).not.toEqual([]);
  });

  it("flags an invalid content hash", () => {
    const bad = structuredClone(seedDataset);
    bad.assets[0] = { ...bad.assets[0], contentHash: "deadbeef" };
    expect(assetCoherenceViolations(bad.assets)).not.toEqual([]);
  });

  it("flags utilization totals that exceed invocations", () => {
    const bad = structuredClone(seedDataset);
    bad.utilization[0] = { ...bad.utilization[0], successes: 9999 };
    expect(referentialIntegrityViolations(bad)).not.toEqual([]);
  });

  it("flags dangling bridge rows", () => {
    const bad = structuredClone(seedDataset);
    bad.assetTags.push({ assetId: "missing", tagId: "tag-d-0" });
    expect(referentialIntegrityViolations(bad)).not.toEqual([]);
  });

  it("flags an eval result pointing at a missing asset", () => {
    const bad = structuredClone(seedDataset);
    bad.evalResults.push({
      id: "ev-x",
      tenantId: TENANT,
      assetId: "missing",
      caseHash: "c1",
      date: "2026-07-07",
      trials: 3,
      passed: 3,
      failed: 0,
      errored: 0,
      inconclusive: 0,
      latencyMs: 10,
      tokens: 0,
      cost: 0,
      quality: "full",
    });
    const violations = referentialIntegrityViolations(bad);
    expect(
      violations.some((v) => v.includes("dangling eval-result asset")),
    ).toBe(true);
  });

  it("flags eval outcomes that exceed trials", () => {
    const bad = structuredClone(seedDataset);
    bad.evalResults.push({
      id: "ev-y",
      tenantId: TENANT,
      assetId: bad.assets[0].id,
      caseHash: "c1",
      date: "2026-07-07",
      trials: 2,
      passed: 2,
      failed: 2,
      errored: 0,
      inconclusive: 0,
      latencyMs: 10,
      tokens: 0,
      cost: 0,
      quality: "full",
    });
    const violations = referentialIntegrityViolations(bad);
    expect(
      violations.some((v) => v.includes("eval outcomes exceed trials")),
    ).toBe(true);
  });

  // Audit item 10 regression: the catalog stays referentially clean. The
  // search-consumption-cli skill ships in the fabric-library projection, and once
  // that projection is merged into the seed it carries zero dangling edges.
  describe("catalog referential integrity (audit item 10)", () => {
    const catalog = mergeProjection(
      seedDataset,
      fabricLibraryProjection,
      TENANT,
      {
        reconcileByTypeSlug: true,
      },
    );

    it("the merged fabric-library catalog passes the full contract", () => {
      expect(runDataSourceContract(catalog)).toEqual([]);
    });

    it("the catalog includes the search-consumption-cli skill", () => {
      expect(
        catalog.assets.some((asset) => asset.slug === "search-consumption-cli"),
      ).toBe(true);
    });

    it("negative control: a dependency on a missing asset is flagged as dangling", () => {
      const bad = structuredClone(catalog);
      const source = bad.assets[0].id;
      bad.dependencies.push({
        assetId: source,
        dependsOnAssetId: "as-does-not-exist",
      });
      const violations = runDataSourceContract(bad);
      expect(violations).not.toEqual([]);
      expect(
        violations.some((violation) =>
          violation.includes("dangling dependency target"),
        ),
      ).toBe(true);
    });
  });
});
