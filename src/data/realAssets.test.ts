import { describe, expect, it } from 'vitest';

import { runDataSourceContract } from './contract';
import { contentHashOf } from './hash';
import { mergeProjection } from './merge';
import { realAssetId, realAssetsProjection } from './realAssets';
import { seedDataset, TENANT } from './seed';
import type { VaultDataset } from './types';

describe('realAssetsProjection', () => {
  it('derives deterministic ids that mirror the producer rule', () => {
    expect(realAssetId('skill', 'brainstorming')).toBe('cc-skill-brainstorming');
    expect(realAssetId('mcp-server', 'plugin_playwright_playwright')).toBe(
      'cc-mcp-server-plugin-playwright-playwright'
    );
    for (const asset of realAssetsProjection.assets) {
      expect(asset.id).toBe(realAssetId(asset.type, asset.slug));
    }
  });

  it('computes content hashes the seed contract will accept', () => {
    for (const asset of realAssetsProjection.assets) {
      expect(asset.contentHash).toBe(contentHashOf(asset.type, asset.body));
    }
  });

  it('merges into a dataset with no coherence or referential violations', () => {
    const empty: VaultDataset = {
      assets: [],
      tags: [
        { id: 'tag-c-0', tenantId: TENANT, kind: 'capability', name: 'quality' },
        { id: 'tag-c-1', tenantId: TENANT, kind: 'capability', name: 'research' },
        { id: 'tag-c-2', tenantId: TENANT, kind: 'capability', name: 'devops' },
        { id: 'tag-c-3', tenantId: TENANT, kind: 'capability', name: 'frontend' },
        { id: 'tag-c-9', tenantId: TENANT, kind: 'capability', name: 'ai-platform' },
      ],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [],
      dependencies: [],
      bundleMemberships: [],
      evalResults: [],
      utilization: [],
    };
    const merged = mergeProjection(empty, realAssetsProjection, TENANT);
    expect(runDataSourceContract(merged)).toEqual([]);
  });

  it('is present in the exported seed dataset', () => {
    const ids = new Set(seedDataset.assets.map((asset) => asset.id));
    expect(ids.has('cc-subagent-example-helper')).toBe(true);
    expect(ids.has('cc-mcp-server-example-docs-server')).toBe(true);
    expect(seedDataset.bundles.some((bundle) => bundle.id === 'bun-cc')).toBe(true);
  });
});
