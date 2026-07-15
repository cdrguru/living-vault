import { describe, expect, it } from 'vitest';

import { findSearchTarget } from './search';
import { TABLE_IDS } from './modelMeta';
import type { AssetRow, VaultDataset } from '@/data/types';

const asset = (name: string, slug: string): AssetRow => ({
  id: slug,
  tenantId: 't',
  type: 'skill',
  name,
  slug,
  description: '',
  body: '',
  version: '1.0.0',
  status: 'active',
  riskLevel: 'low',
  maturity: 0.5,
  tier: 'stock',
  contentHash: 'h',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const dataset = {
  assets: [asset('Brainstorming', 'brainstorming'), asset('Playwright MCP', 'plugin_playwright_playwright')],
} as unknown as VaultDataset;

const visible = [...TABLE_IDS];

describe('findSearchTarget', () => {
  it('matches a table by name', () => {
    expect(findSearchTarget('owner', dataset, visible)).toBe('Owner');
    expect(findSearchTarget('UTIL', dataset, visible)).toBe('Utilization');
  });

  it('routes an asset name or slug match to the Asset table', () => {
    expect(findSearchTarget('brain', dataset, visible)).toBe('Asset');
    expect(findSearchTarget('playwright', dataset, visible)).toBe('Asset');
  });

  it('returns null for an empty query or no match', () => {
    expect(findSearchTarget('', dataset, visible)).toBeNull();
    expect(findSearchTarget('   ', dataset, visible)).toBeNull();
    expect(findSearchTarget('zzz-nothing', dataset, visible)).toBeNull();
  });

  it('ignores targets that are not currently visible', () => {
    expect(findSearchTarget('owner', dataset, ['Asset'])).toBeNull();
  });
});
