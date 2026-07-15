import type { Size } from './geometry';
import { visibleTables, type LayoutMode, type TableId } from './modelMeta';

export interface CardPosition {
  x: number;
  y: number;
}

export type Layout = Partial<Record<TableId, CardPosition>>;

// Room reserved on the Asset card for its operational signal footer (the
// governed/effective/error chips, staleness badge, and sparkline in TableCard),
// which can wrap to two lines. Only the Asset card renders that footer today.
const SIGNAL_FOOTER_HEIGHT = 48;

// Card sizes give the larger, more legible labels room so field lists never clip
// at normal zoom. The Asset hub stays 240 x 248 (200 body plus the signal footer)
// because the useCanvas rect test pins those dimensions; the other cards grow a
// little taller and wider to seat the bigger header and field text.
export const CARD_SIZES: Record<TableId, Size> = {
  Asset: { width: 240, height: 200 + SIGNAL_FOOTER_HEIGHT },
  Owner: { width: 212, height: 150 },
  Origin: { width: 212, height: 138 },
  Tag: { width: 212, height: 138 },
  Bundle: { width: 212, height: 138 },
  Utilization: { width: 236, height: 150 },
  AssetTag: { width: 208, height: 92 },
  BundleMembership: { width: 208, height: 92 },
  AssetDependency: { width: 208, height: 92 },
};

export const DEFAULT_LAYOUTS: Record<LayoutMode, Layout> = {
  collapsed: {
    Owner: { x: 60, y: 140 },
    Origin: { x: 60, y: 440 },
    Asset: { x: 430, y: 250 },
    Tag: { x: 850, y: 140 },
    Bundle: { x: 850, y: 440 },
    Utilization: { x: 438, y: 560 },
  },
  expanded: {
    Owner: { x: 60, y: 200 },
    Origin: { x: 60, y: 460 },
    Asset: { x: 430, y: 270 },
    Tag: { x: 900, y: 140 },
    Bundle: { x: 900, y: 480 },
    Utilization: { x: 438, y: 600 },
    AssetTag: { x: 670, y: 110 },
    BundleMembership: { x: 670, y: 510 },
    AssetDependency: { x: 340, y: 40 },
  },
};

const STORAGE_KEY = 'vault.model.layout.v1';

type StoredLayouts = Partial<Record<LayoutMode, Layout>>;

function readStored(): StoredLayouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as StoredLayouts;
  } catch {
    return {};
  }
}

function writeStored(stored: StoredLayouts): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Best effort: private mode or quota pressure. In-memory layout still works.
  }
}

export function loadLayout(mode: LayoutMode): Layout {
  const stored = readStored()[mode] ?? {};
  const layout: Layout = {};
  for (const id of visibleTables(mode)) {
    const candidate = stored[id];
    layout[id] =
      candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
        ? { x: candidate.x, y: candidate.y }
        : { ...DEFAULT_LAYOUTS[mode][id]! };
  }
  return layout;
}

export function saveLayout(mode: LayoutMode, layout: Layout): void {
  const stored = readStored();
  stored[mode] = layout;
  writeStored(stored);
}

export function resetLayout(mode: LayoutMode): Layout {
  const stored = readStored();
  delete stored[mode];
  writeStored(stored);
  return loadLayout(mode);
}
