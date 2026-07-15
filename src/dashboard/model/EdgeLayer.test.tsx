import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EdgeLayer } from './EdgeLayer';
import { edgeStrokeWidth } from './edgeWeight';
import type { Rect } from './geometry';
import { CARD_SIZES, DEFAULT_LAYOUTS } from './layout';
import { edgesForMode, visibleTables, type TableId } from './modelMeta';

function collapsedRects(): Partial<Record<TableId, Rect>> {
  const rects: Partial<Record<TableId, Rect>> = {};
  for (const id of visibleTables('collapsed')) {
    rects[id] = { ...DEFAULT_LAYOUTS.collapsed[id]!, ...CARD_SIZES[id] };
  }
  return rects;
}

function expandedRects(): Partial<Record<TableId, Rect>> {
  const rects: Partial<Record<TableId, Rect>> = {};
  for (const id of visibleTables('expanded')) {
    rects[id] = { ...DEFAULT_LAYOUTS.expanded[id]!, ...CARD_SIZES[id] };
  }
  return rects;
}

describe('EdgeLayer', () => {
  it('renders a clickable pill for every labeled collapsed edge', async () => {
    const onSelectRelationship = vi.fn();
    render(
      <EdgeLayer
        edges={edgesForMode('collapsed')}
        hoveredTable={null}
        onSelectRelationship={onSelectRelationship}
        rects={collapsedRects()}
        selectedRelationship={null}
      />
    );
    for (const label of [
      '0..1 owner',
      '0..1 origin',
      '1:* daily',
      '*:* via AssetTag',
      '*:* via BundleMembership',
      'depends on',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Every collapsed edge either states cardinality in its pill (the five
    // cardinality pills) or is the self loop, so the SVG end glyphs are fully
    // suppressed and the count drops to zero.
    expect(document.querySelectorAll('text')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: '*:* via AssetTag' }));
    expect(onSelectRelationship).toHaveBeenCalledWith('asset-tag');
  });

  it('suppresses the SVG end glyphs when the pill already states cardinality', () => {
    render(
      <EdgeLayer
        edges={edgesForMode('collapsed')}
        hoveredTable={null}
        onSelectRelationship={() => undefined}
        rects={collapsedRects()}
        selectedRelationship={null}
      />
    );
    // No standalone SVG cardinality glyph survives, only the pill text states it.
    expect(document.querySelectorAll('text')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '0..1 owner' })).toBeInTheDocument();
    const textNodes = Array.from(document.querySelectorAll('text')).map((node) => node.textContent);
    expect(textNodes).not.toContain('0..1');
  });

  it('keeps the SVG glyphs for pill-less join edges and field-name pill dependency edges', () => {
    render(
      <EdgeLayer
        edges={edgesForMode('expanded')}
        hoveredTable={null}
        onSelectRelationship={() => undefined}
        rects={expandedRects()}
        selectedRelationship={null}
      />
    );
    // The four pill-less join legs and the two field-name dependency edges keep
    // their end glyphs, so the SVG text count stays above zero.
    expect(document.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('selects a relationship when a pill-less edge line is clicked', async () => {
    const onSelectRelationship = vi.fn();
    const { container } = render(
      <EdgeLayer
        edges={edgesForMode('expanded')}
        hoveredTable={null}
        onSelectRelationship={onSelectRelationship}
        rects={expandedRects()}
        selectedRelationship={null}
      />
    );
    // assettag-asset has no pill, so before this its relationship could only be
    // reached through the panel. The transparent hit stroke makes the line itself
    // selectable.
    const hit = container.querySelector('[data-edge-hit="assettag-asset"]');
    expect(hit).not.toBeNull();
    fireEvent.click(hit as Element);
    expect(onSelectRelationship).toHaveBeenCalledWith('asset-tag');
  });

  it('gives every drawn edge a hit target, including the self loop', () => {
    const { container } = render(
      <EdgeLayer
        edges={edgesForMode('collapsed')}
        hoveredTable={null}
        onSelectRelationship={() => undefined}
        rects={collapsedRects()}
        selectedRelationship={null}
      />
    );
    // Six collapsed edges, including the asset-dependency self loop.
    expect(container.querySelectorAll('[data-edge-hit]')).toHaveLength(6);
    expect(
      container.querySelector('[data-edge-hit="asset-dependency"]'),
    ).not.toBeNull();
  });

  it('scales stroke width with link count and keeps active edges heavier', () => {
    const w = (count: number, active = false) => edgeStrokeWidth(count, 10, 1000, active);
    expect(w(1000)).toBeGreaterThan(w(10));
    expect(w(500)).toBeGreaterThanOrEqual(w(100));
    expect(w(10, true)).toBeGreaterThan(w(10, false));
    expect(w(0, false)).toBeGreaterThan(0);
  });

  it('skips edges whose endpoints have no rect', () => {
    render(
      <EdgeLayer
        edges={edgesForMode('expanded')}
        hoveredTable={null}
        onSelectRelationship={() => undefined}
        rects={collapsedRects()}
        selectedRelationship={null}
      />
    );
    expect(screen.queryByRole('button', { name: 'assetId' })).not.toBeInTheDocument();
  });
});

