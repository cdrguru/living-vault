import { describe, expect, it } from 'vitest';

import { modelRate } from './harnessCost';
import { contentHashOf } from './hash';
import { baseDataset, seedDataset } from './seed';

describe('seedDataset', () => {
  it('has a realistic multi-tier asset library', () => {
    const { assets } = seedDataset;
    expect(assets.length).toBeGreaterThanOrEqual(40);
    expect(new Set(assets.map((asset) => asset.tier))).toEqual(
      new Set(['stock', 'custom', 'forked'])
    );
    expect(assets.filter((asset) => asset.tier === 'stock').length).toBeGreaterThan(
      assets.filter((asset) => asset.tier !== 'stock').length
    );
  });

  it('covers every asset type and derives content hashes deterministically', () => {
    const types = new Set(seedDataset.assets.map((asset) => asset.type));
    expect(types.size).toBe(7);
    for (const asset of seedDataset.assets) {
      expect(asset.contentHash).toBe(contentHashOf(asset.type, asset.body));
    }
  });

  it('labels seed utilization with a varied set of synthetic models', () => {
    // seedDataset.utilization is the complete synthetic demo telemetry folded in
    // from src/data/imports/utilization.json (scripts/generate-demo-telemetry.mts),
    // which labels every row with a model so usageByModel has a real breakdown.
    const { utilization } = seedDataset;
    const withModel = utilization.filter((row) => row.model).length;
    expect(withModel).toBeGreaterThan(0);
    expect(withModel / utilization.length).toBeGreaterThan(0.5);
    const distinctModels = new Set(
      utilization.map((row) => row.model).filter(Boolean),
    );
    expect(distinctModels.size).toBeGreaterThanOrEqual(2);
  });

  it('has utilization for most assets and resolvable foreign keys', () => {
    const { assets, assetTags, dependencies, tags, utilization } = seedDataset;
    const assetIds = new Set(assets.map((asset) => asset.id));
    const tagIds = new Set(tags.map((tag) => tag.id));
    expect(utilization.length).toBeGreaterThan(assets.length * 5);
    for (const row of utilization) expect(assetIds.has(row.assetId)).toBe(true);
    for (const row of assetTags) {
      expect(assetIds.has(row.assetId)).toBe(true);
      expect(tagIds.has(row.tagId)).toBe(true);
    }
    for (const row of dependencies) {
      expect(assetIds.has(row.assetId)).toBe(true);
      expect(assetIds.has(row.dependsOnAssetId)).toBe(true);
    }
  });

  it('includes forked assets behind their stock baseline', () => {
    const forked = seedDataset.assets.filter((asset) => asset.tier === 'forked');
    expect(forked.length).toBeGreaterThanOrEqual(1);
    expect(forked.every((asset) => asset.stockVersion)).toBe(true);
  });

  it('draws legacy seed utilization cost from its own tokens at the model list rate', () => {
    // These rows never reach the SPA (composeSeedDataset replaces them with the
    // committed demo telemetry) but they do reach the MCP's baseDataset merge.
    // Cost used to be an independent random draw, implying nonsense effective
    // rates of roughly $0.67 to $44 per 1M tokens; it must cohere with the
    // row's own tokens and pricing.json.
    expect(baseDataset.utilization.length).toBeGreaterThan(0);
    for (const row of baseDataset.utilization) {
      const expected = (row.tokens / 1_000_000) * modelRate(row.model ?? null);
      expect(row.cost).toBeCloseTo(expected, 5); // cost is stored rounded to 6 decimals
    }
  });
});
