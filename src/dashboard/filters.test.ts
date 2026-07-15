import { describe, expect, it } from 'vitest';

import { seedDataset } from '@/data';
import { applyFilters, defaultFilters } from './filters';

describe('applyFilters', () => {
  it('filters assets by risk level', () => {
    const result = applyFilters(seedDataset, { ...defaultFilters, risk: 'medium' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((asset) => asset.riskLevel === 'medium')).toBe(true);
  });

  it('narrows to only high-risk assets when filtered by high', () => {
    const result = applyFilters(seedDataset, { ...defaultFilters, risk: 'high' });
    expect(result.every((asset) => asset.riskLevel === 'high')).toBe(true);
    expect(result.length).toBe(
      seedDataset.assets.filter((asset) => asset.riskLevel === 'high').length,
    );
  });

  it('returns every asset when risk is "all"', () => {
    const result = applyFilters(seedDataset, { ...defaultFilters, risk: 'all' });
    expect(result.length).toBe(seedDataset.assets.length);
  });

  it('combines risk with type', () => {
    const result = applyFilters(seedDataset, { ...defaultFilters, risk: 'medium', type: 'skill' });
    expect(result.every((asset) => asset.riskLevel === 'medium' && asset.type === 'skill')).toBe(
      true
    );
  });
});
