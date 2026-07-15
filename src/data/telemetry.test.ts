import { describe, expect, it } from 'vitest';

import { runDataSourceContract } from './contract';
import { mergeProjection } from './merge';
import { fabricLibraryProjection } from './projection';
import { seedDataset, TENANT } from './seed';
import { applyTelemetry } from './telemetry';
import type { TelemetryMeta, UtilizationRow } from './types';

const META: TelemetryMeta = {
  source: 'claude-code',
  generatedAt: '2026-06-07T00:00:00Z',
  windowStart: '2026-06-01',
  windowEnd: '2026-06-07',
  sessions: 3,
  tracked: { invocations: true, successes: true, errors: true, latency: true, refusals: false, tokens: false, cost: false },
};

function rowFor(assetId: string): UtilizationRow {
  return { id: `claude-code:${assetId}:2026-06-07`, tenantId: TENANT, assetId, date: '2026-06-07', invocations: 10, successes: 8, errors: 2, refusals: 0, latencyMs: 1200, tokens: 0, cost: 0 };
}

describe('applyTelemetry', () => {
  it('replaces utilization with the imported rows and sets meta', () => {
    const dataset = mergeProjection(seedDataset, fabricLibraryProjection, TENANT);
    const knownId = dataset.assets[0].id;
    const next = applyTelemetry(dataset, [rowFor(knownId)], META);
    expect(next.utilization).toHaveLength(1);
    expect(next.utilization[0].assetId).toBe(knownId);
    expect(next.telemetryMeta).toEqual(META);
    expect(runDataSourceContract(next)).toEqual([]);
  });

  it('drops rows whose assetId is not in the dataset', () => {
    const dataset = mergeProjection(seedDataset, fabricLibraryProjection, TENANT);
    const next = applyTelemetry(dataset, [rowFor(dataset.assets[0].id), rowFor('does-not-exist')], META);
    expect(next.utilization).toHaveLength(1);
    expect(runDataSourceContract(next)).toEqual([]);
  });

  it('dedupes rows that share an id, keeping the last', () => {
    const dataset = mergeProjection(seedDataset, fabricLibraryProjection, TENANT);
    const id = dataset.assets[0].id;
    const a: UtilizationRow = { id: `claude-code:${id}:2026-06-07`, tenantId: TENANT, assetId: id, date: '2026-06-07', invocations: 1, successes: 1, errors: 0, refusals: 0, latencyMs: 100, tokens: 0, cost: 0 };
    const b: UtilizationRow = { ...a, invocations: 9 };
    const next = applyTelemetry(dataset, [a, b], META);
    expect(next.utilization).toHaveLength(1);
    expect(next.utilization[0].invocations).toBe(9);
  });

  it('does not mutate the input dataset', () => {
    const dataset = mergeProjection(seedDataset, fabricLibraryProjection, TENANT);
    const before = dataset.utilization.length;
    applyTelemetry(dataset, [rowFor(dataset.assets[0].id)], META);
    expect(dataset.utilization).toHaveLength(before);
    expect(dataset.telemetryMeta).toBeUndefined();
  });
});
