import type { AssetRow, VaultDataset } from '@/data';

export interface VaultFilters {
  search: string;
  type: 'all' | AssetRow['type'];
  tier: 'all' | AssetRow['tier'];
  status: 'all' | AssetRow['status'];
  risk: 'all' | AssetRow['riskLevel'];
}

export const defaultFilters: VaultFilters = {
  search: '',
  type: 'all',
  tier: 'all',
  status: 'all',
  risk: 'all',
};

export function applyFilters(dataset: VaultDataset, filters: VaultFilters): AssetRow[] {
  const search = filters.search.trim().toLowerCase();
  return dataset.assets.filter((asset) => {
    if (filters.type !== 'all' && asset.type !== filters.type) return false;
    if (filters.tier !== 'all' && asset.tier !== filters.tier) return false;
    if (filters.status !== 'all' && asset.status !== filters.status) return false;
    if (filters.risk !== 'all' && asset.riskLevel !== filters.risk) return false;
    if (!search) return true;
    return [asset.name, asset.slug, asset.description, asset.body, asset.type, asset.tier]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
}
