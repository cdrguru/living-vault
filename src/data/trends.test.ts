import { describe, expect, it } from 'vitest';

import { makeDataset, makeUtilRow } from './__tests__/fixtures';
import { dailyTotals, seriesDelta } from './metrics';
import type { UtilizationRow, VaultDataset } from './types';

// The shared row factory with this file's tenant default kept intact.
const utilRow = (assetId: string, date: string, invocations: number, cost = 0): UtilizationRow =>
  makeUtilRow(assetId, date, invocations, { tenantId: 'tenant-test', cost });

const datasetWith = (utilization: UtilizationRow[]): VaultDataset => makeDataset({ utilization });

describe('dailyTotals', () => {
  it('sums every asset into one ordered row per date', () => {
    const totals = dailyTotals(
      datasetWith([
        utilRow('a1', '2026-06-02', 5, 0.5),
        utilRow('a1', '2026-06-01', 10, 1),
        utilRow('a2', '2026-06-02', 7, 0.7),
        utilRow('a1', '2026-06-10', 3, 0.3),
      ])
    );
    expect(totals.map((row) => row.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-10']);
    expect(totals[1]).toMatchObject({ date: '2026-06-02', invocations: 12, successes: 12 });
    expect(totals[1].cost).toBeCloseTo(1.2);
  });

  it('restricts to an inclusive date window', () => {
    const totals = dailyTotals(
      datasetWith([
        utilRow('a1', '2026-06-01', 10),
        utilRow('a1', '2026-06-02', 5),
        utilRow('a2', '2026-06-02', 7),
        utilRow('a1', '2026-06-10', 3),
      ]),
      { start: '2026-06-02', end: '2026-06-09' }
    );
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({ date: '2026-06-02', invocations: 12 });
  });

  it('returns an empty array when there is no utilization', () => {
    expect(dailyTotals(datasetWith([]))).toEqual([]);
  });
});

describe('seriesDelta', () => {
  it('returns null for series too short to split', () => {
    expect(seriesDelta([])).toBeNull();
    expect(seriesDelta([5])).toBeNull();
  });

  it('compares the trailing half against the prior equal-length half', () => {
    expect(seriesDelta([10, 20])).toBeCloseTo(1); // [20] vs [10]
    expect(seriesDelta([1, 2, 3, 4])).toBeCloseTo(4 / 3); // [3,4]=7 vs [1,2]=3
  });

  it('drops the oldest point so the two windows stay equal on odd lengths', () => {
    expect(seriesDelta([1, 2, 3, 4, 5])).toBeCloseTo(0.8); // [4,5]=9 vs [2,3]=5
  });

  it('reads a decline as a negative change', () => {
    expect(seriesDelta([10, 8, 6, 4])).toBeCloseTo(-(8 / 18)); // [6,4]=10 vs [10,8]=18
  });

  it('is zero for a flat series', () => {
    expect(seriesDelta([5, 5, 5, 5])).toBe(0);
  });

  it('returns null when the prior window is empty (cannot express a ratio)', () => {
    expect(seriesDelta([0, 0, 5, 5])).toBeNull();
  });
});
