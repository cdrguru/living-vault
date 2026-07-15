import { beforeEach, describe, expect, it } from "vitest";

import { runDataSourceContract } from "./contract";
import { fabricLibraryProjection } from "./projection";
import { SeedDataSource } from "./SeedDataSource";

const PROJECTION_ASSETS = fabricLibraryProjection.assets.length;

describe("fabric library import (end to end)", () => {
  beforeEach(() => localStorage.clear());

  it("imports the projection without duplicating any existing skill, contract-clean", async () => {
    const ds = new SeedDataSource();
    const before = await ds.getDataset();
    const seedCount = before.assets.length;
    const key = (a: { type: string; slug: string }) => `${a.type}::${a.slug}`;
    const countByKey = (assets: { type: string; slug: string }[]) => {
      const m = new Map<string, number>();
      for (const a of assets) m.set(key(a), (m.get(key(a)) ?? 0) + 1);
      return m;
    };
    const beforeCount = countByKey(before.assets);
    const projKeys = new Set(fabricLibraryProjection.assets.map(key));

    const first = await ds.importProjection(fabricLibraryProjection);
    // Every projection asset is accounted for, and exactly the skills the catalog
    // already carried are reconciled (updated) rather than duplicated (added).
    expect(first.added + first.updated).toBe(PROJECTION_ASSETS);
    const expectedUpdated = [...projKeys].filter((k) =>
      beforeCount.has(k),
    ).length;
    expect(first.updated).toBe(expectedUpdated);
    expect(expectedUpdated).toBeGreaterThan(0);

    const afterFirst = await ds.getDataset();
    expect(afterFirst.assets.length).toBe(seedCount + first.added);
    expect(runDataSourceContract(afterFirst)).toEqual([]);

    // The fix's core invariant: the sync creates no new duplicate. Every projection
    // (type, slug) ends with the same row count it had before (reconciled in place),
    // or exactly one row if it is new. A partial reconciliation would inflate a count.
    const afterCount = countByKey(afterFirst.assets);
    for (const k of projKeys) {
      expect(afterCount.get(k)).toBe(beforeCount.get(k) ?? 1);
    }
  });

  it("reconciles an overlay skill instead of adding a second entry for it", async () => {
    const ds = new SeedDataSource();
    const before = (await ds.getDataset()).assets.filter(
      (a) => a.type === "skill" && a.slug === "deneb-visuals",
    );
    // The overlay already carries deneb-visuals under its cc- id before any sync.
    expect(before).toHaveLength(1);
    expect(before[0].id).toBe("cc-skill-deneb-visuals");

    await ds.importProjection(fabricLibraryProjection);

    const after = (await ds.getDataset()).assets.filter(
      (a) => a.type === "skill" && a.slug === "deneb-visuals",
    );
    // Still one entry, still on the telemetry-bearing overlay id.
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("cc-skill-deneb-visuals");
  });

  it("is idempotent: a second import adds nothing and only updates", async () => {
    const ds = new SeedDataSource();
    await ds.importProjection(fabricLibraryProjection);
    const countAfterFirst = (await ds.getDataset()).assets.length;

    const second = await ds.importProjection(fabricLibraryProjection);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(PROJECTION_ASSETS);
    expect((await ds.getDataset()).assets.length).toBe(countAfterFirst);
  });

  it("preserves seed utilization telemetry across import", async () => {
    const ds = new SeedDataSource();
    const before = (await ds.getDataset()).utilization;
    await ds.importProjection(fabricLibraryProjection);
    const after = (await ds.getDataset()).utilization;
    expect(after).toEqual(before);
  });

  it("wires the connector as an mcp-server asset with its dependency edges", async () => {
    const ds = new SeedDataSource();
    await ds.importProjection(fabricLibraryProjection);
    const data = await ds.getDataset();
    const connector = data.assets.find(
      (a) => a.type === "mcp-server" && a.slug === "powerbi-query",
    );
    expect(connector).toBeTruthy();
    const edges = data.dependencies.filter(
      (d) => d.dependsOnAssetId === connector?.id,
    );
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });
});
