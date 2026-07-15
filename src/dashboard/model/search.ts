import type { VaultDataset } from '@/data/types';

import { TABLE_IDS, type TableId } from './modelMeta';

/**
 * Resolve a canvas search query to the table to fly to. A table name match wins;
 * otherwise an asset name or slug match routes to the Asset hub, since assets live
 * at table grain on this canvas. Returns null for an empty query, no match, or a
 * match on a table that is not currently visible.
 */
export function findSearchTarget(
  query: string,
  dataset: VaultDataset,
  visible: TableId[]
): TableId | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const visibleSet = new Set(visible);

  const tableMatch = TABLE_IDS.find((id) => visibleSet.has(id) && id.toLowerCase().includes(q));
  if (tableMatch) return tableMatch;

  if (
    visibleSet.has('Asset') &&
    dataset.assets.some(
      (asset) => asset.name.toLowerCase().includes(q) || asset.slug.toLowerCase().includes(q)
    )
  ) {
    return 'Asset';
  }

  return null;
}
