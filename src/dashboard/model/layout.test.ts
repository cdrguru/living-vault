import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CARD_SIZES,
  DEFAULT_LAYOUTS,
  loadLayout,
  resetLayout,
  saveLayout,
} from './layout';
import { TABLE_IDS, visibleTables } from './modelMeta';

const STORAGE_KEY = 'vault.model.layout.v1';

describe('layout defaults', () => {
  it('covers every visible table in both modes', () => {
    for (const mode of ['collapsed', 'expanded'] as const) {
      for (const id of visibleTables(mode)) {
        expect(DEFAULT_LAYOUTS[mode][id]).toBeDefined();
      }
    }
  });

  it('has a size for all nine tables', () => {
    for (const id of TABLE_IDS) {
      expect(CARD_SIZES[id].width).toBeGreaterThan(0);
      expect(CARD_SIZES[id].height).toBeGreaterThan(0);
    }
  });
});

describe('layout persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a saved layout per mode', () => {
    const layout = loadLayout('collapsed');
    layout.Asset = { x: 999, y: 111 };
    saveLayout('collapsed', layout);
    expect(loadLayout('collapsed').Asset).toEqual({ x: 999, y: 111 });
    expect(loadLayout('expanded').Asset).toEqual(DEFAULT_LAYOUTS.expanded.Asset);
  });

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadLayout('collapsed')).toEqual(DEFAULT_LAYOUTS.collapsed);
  });

  it('falls back per entry on invalid coordinates', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ collapsed: { Asset: { x: 'nope', y: 2 } } })
    );
    expect(loadLayout('collapsed').Asset).toEqual(DEFAULT_LAYOUTS.collapsed.Asset);
  });

  it('reset clears only the given mode', () => {
    saveLayout('collapsed', { ...loadLayout('collapsed'), Asset: { x: 1, y: 2 } });
    saveLayout('expanded', { ...loadLayout('expanded'), Asset: { x: 3, y: 4 } });
    expect(resetLayout('collapsed')).toEqual(DEFAULT_LAYOUTS.collapsed);
    expect(loadLayout('expanded').Asset).toEqual({ x: 3, y: 4 });
  });

  it('swallows write failures so drag end never throws', () => {
    const original = globalThis.localStorage;
    vi.stubGlobal('localStorage', {
      ...original,
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    try {
      expect(() => saveLayout('collapsed', loadLayout('collapsed'))).not.toThrow();
      expect(() => resetLayout('collapsed')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
