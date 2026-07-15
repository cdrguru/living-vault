import { describe, expect, it } from 'vitest';

import { healthStatus, tableSignal, type TableSignal } from './signals';
import type {
  AssetRow,
  AssetTagRow,
  UtilizationRow,
  VaultDataset,
} from '@/data/types';

const TENANT = 'tenant-test';

const mkAsset = (over: Partial<AssetRow> & Pick<AssetRow, 'id'>): AssetRow => ({
  tenantId: TENANT,
  type: 'skill',
  name: over.id,
  slug: over.id,
  description: 'A governed asset.',
  body: 'body',
  version: '1.0.0',
  status: 'active',
  riskLevel: 'low',
  maturity: 0.8,
  tier: 'stock',
  contentHash: `hash-${over.id}`,
  ownerId: 'own-1',
  originId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  ...over,
});

const util = (assetId: string, date: string, invocations: number, errors = 0): UtilizationRow => ({
  id: `${assetId}:${date}`,
  tenantId: TENANT,
  assetId,
  date,
  invocations,
  successes: invocations - errors,
  errors,
  refusals: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
});

const assetTags: AssetTagRow[] = [
  { assetId: 'a1', tagId: 't1' },
  { assetId: 'a2', tagId: 't1' },
  { assetId: 'a3', tagId: 't1' },
];

const dataset: VaultDataset = {
  assets: [
    mkAsset({ id: 'a1' }),
    mkAsset({ id: 'a2' }),
    mkAsset({ id: 'a3', ownerId: undefined, status: 'deprecated', updatedAt: '2025-01-01T00:00:00Z' }),
  ],
  tags: [{ id: 't1', tenantId: TENANT, kind: 'domain', name: 'd' }],
  origins: [{ id: 'org-1', tenantId: TENANT, name: 'o', kind: 'local' }],
  owners: [{ id: 'own-1', tenantId: TENANT, name: 'p', email: 'p@x.io', role: 'maintainer' }],
  bundles: [],
  assetTags,
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [util('a1', '2026-06-01', 10, 2), util('a1', '2026-06-02', 6), util('a2', '2026-06-02', 4)],
};

describe('tableSignal', () => {
  it('rolls per asset metrics up to a population signal on the Asset table', () => {
    const signal = tableSignal(dataset, 'Asset');
    expect(signal).not.toBeNull();
    expect(signal?.assetCount).toBe(3);
    expect(signal?.governedRate).toBeCloseTo(2 / 3);
    expect(signal?.staleCount).toBe(1);
    expect(signal?.invocations).toBe(20);
    expect(signal?.errorRate).toBeCloseTo(0.1);
    expect(signal?.series).toEqual([10, 10]);
    expect(signal?.hasTelemetry).toBe(true);
  });

  it('windows the signal by date', () => {
    const signal = tableSignal(dataset, 'Asset', { start: '2026-06-02', end: '2026-06-02' });
    expect(signal?.invocations).toBe(10);
    expect(signal?.series).toEqual([10]);
    expect(signal?.errorRate).toBe(0);
  });

  it('reads no telemetry as a distinct state, not a measured zero', () => {
    const signal = tableSignal({ ...dataset, utilization: [] }, 'Asset');
    expect(signal?.hasTelemetry).toBe(false);
    expect(signal?.invocations).toBe(0);
    expect(signal?.series).toEqual([]);
  });

  it('returns null for structural tables that carry no asset population', () => {
    expect(tableSignal(dataset, 'Tag')).toBeNull();
    expect(tableSignal(dataset, 'AssetDependency')).toBeNull();
  });
});

const healthy: TableSignal = {
  assetCount: 10,
  governedRate: 1,
  effectiveRate: 0.8,
  errorRate: 0.01,
  staleCount: 0,
  invocations: 100,
  series: [4, 5, 6],
  hasTelemetry: true,
};

describe('healthStatus', () => {
  it('is unknown when there is no signal or no telemetry', () => {
    expect(healthStatus(null)).toBe('unknown');
    expect(healthStatus({ ...healthy, hasTelemetry: false })).toBe('unknown');
  });

  it('is at-risk when errors are high or effectiveness collapses', () => {
    expect(healthStatus({ ...healthy, errorRate: 0.2 })).toBe('at-risk');
    expect(healthStatus({ ...healthy, effectiveRate: 0.1 })).toBe('at-risk');
  });

  it('is attention for stale assets or middling effectiveness', () => {
    expect(healthStatus({ ...healthy, staleCount: 3 })).toBe('attention');
    expect(healthStatus({ ...healthy, effectiveRate: 0.4 })).toBe('attention');
  });

  it('is healthy when effective, fresh, and low error', () => {
    expect(healthStatus(healthy)).toBe('healthy');
  });
});
