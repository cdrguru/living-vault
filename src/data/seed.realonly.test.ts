import { describe, expect, it } from 'vitest';

import { runDataSourceContract } from './contract';
import { composeSeedDataset } from './seed';

// The synthetic demo seed (seed.ts stockNames/customNames) carries `as-*` ids; the
// real-assets overlay carries `cc-*` ids. On the owner's dev server, when the real
// overlay is present, the catalog should show ONLY the real overlay, not the demo
// fixtures. composeSeedDataset is the pure unit behind that env-gated decision.
describe('composeSeedDataset real-only gate', () => {
  it('drops the synthetic demo seed (as-* assets) when realOnly is true', () => {
    const ds = composeSeedDataset(true);
    expect(ds.assets.filter((a) => a.id.startsWith('as-'))).toEqual([]);
    expect(ds.assets.length).toBeGreaterThan(0);
    expect(ds.assets.every((a) => a.id.startsWith('cc-'))).toBe(true);
  });

  it('keeps the synthetic demo seed when realOnly is false', () => {
    const ds = composeSeedDataset(false);
    expect(ds.assets.some((a) => a.id.startsWith('as-'))).toBe(true);
    expect(ds.assets.some((a) => a.id.startsWith('cc-'))).toBe(true);
  });

  it('only folds in telemetry for assets that exist in real-only mode', () => {
    const ds = composeSeedDataset(true);
    const ids = new Set(ds.assets.map((a) => a.id));
    for (const row of ds.utilization) expect(ids.has(row.assetId)).toBe(true);
  });

  it('produces a referentially coherent dataset in real-only mode', () => {
    expect(runDataSourceContract(composeSeedDataset(true))).toEqual([]);
  });
});
