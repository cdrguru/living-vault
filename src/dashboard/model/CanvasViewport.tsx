import { useMemo } from 'react';

import { Button } from '@/dashboard/components/Button';
import type { VaultDataset } from '@/data';
import type { DateWindow } from '@/data/metrics';

import { EdgeLayer } from './EdgeLayer';
import { Minimap } from './Minimap';
import { TableCard } from './TableCard';
import { tableSignal } from './signals';
import type { CanvasApi } from './useCanvas';
import {
  TABLES,
  edgesForMode,
  visibleTables,
  type LayoutMode,
  type RelationshipId,
  type TableId,
} from './modelMeta';

export function CanvasViewport({
  canvas,
  dataset,
  health = false,
  hoveredTable,
  mode,
  onHoverTable,
  onSelectRelationship,
  onSelectTable,
  selectedRelationship,
  selectedTable,
  window,
}: {
  canvas: CanvasApi;
  dataset: VaultDataset;
  health?: boolean;
  hoveredTable: TableId | null;
  mode: LayoutMode;
  onHoverTable: (id: TableId | null) => void;
  onSelectRelationship: (id: RelationshipId) => void;
  onSelectTable: (id: TableId | null) => void;
  selectedRelationship: RelationshipId | null;
  selectedTable: TableId | null;
  window?: DateWindow;
}) {
  const { transform } = canvas;
  const edges = edgesForMode(mode);
  const gridSize = 16 * transform.scale;
  const panelOpen = selectedTable !== null || selectedRelationship !== null;

  // The signal is the only per-render expensive work on the canvas (it scans the
  // utilization table several times), and it depends only on the dataset and the
  // time window, not on pan, zoom, or hover. Memoize it so gestures stay cheap.
  const assetSignal = useMemo(() => tableSignal(dataset, 'Asset', window), [dataset, window]);

  const neighbors = useMemo(() => {
    if (!hoveredTable) return null;
    const connected = new Set<TableId>([hoveredTable]);
    for (const edge of edges) {
      if (edge.from === hoveredTable) connected.add(edge.to);
      if (edge.to === hoveredTable) connected.add(edge.from);
    }
    return connected;
  }, [edges, hoveredTable]);

  return (
    <div
      aria-label="Model canvas. Use plus and minus to zoom, 0 to fit."
      className="absolute inset-0 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-accent"
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelectTable(null);
      }}
      onKeyDown={(event) => {
        if (event.key === '+' || event.key === '=') canvas.zoomBy(1.2);
        if (event.key === '-') canvas.zoomBy(1 / 1.2);
        if (event.key === '0') canvas.fit();
      }}
      onPointerDown={(event) => {
        canvas.onCanvasPointerDown(event);
        canvas.onPanStart(event);
      }}
      onPointerMove={(event) => {
        canvas.onCanvasPointerMove(event);
        canvas.onPanMove(event);
      }}
      onPointerUp={(event) => {
        canvas.onCanvasPointerUp(event);
        canvas.onPanEnd();
      }}
      ref={canvas.viewportRef}
      style={{
        backgroundImage: 'radial-gradient(var(--chart-grid) 1px, transparent 1px)',
        backgroundPosition: `${transform.x}px ${transform.y}px`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
      tabIndex={0}
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <div className="pointer-events-auto">
          <EdgeLayer
            dataset={dataset}
            edges={edges}
            hoveredTable={hoveredTable}
            onSelectRelationship={onSelectRelationship}
            rects={canvas.rects}
            selectedRelationship={selectedRelationship}
          />
          {visibleTables(mode).map((id) => {
            const rect = canvas.rects[id];
            if (!rect) return null;
            return (
              <TableCard
                animatePosition={canvas.dragging !== id}
                count={TABLES[id].count(dataset)}
                dimmed={neighbors !== null && !neighbors.has(id)}
                key={id}
                meta={TABLES[id]}
                onHeaderPointerDown={canvas.startCardDrag(id)}
                onHeaderPointerMove={canvas.onCardDragMove}
                onHeaderPointerUp={canvas.onCardDragEnd}
                onHoverChange={(hovered) => onHoverTable(hovered ? id : null)}
                onSelect={() => {
                  if (!canvas.wasDragged()) onSelectTable(id);
                }}
                health={health}
                rect={rect}
                selected={selectedTable === id}
                signal={id === 'Asset' ? assetSignal : null}
              />
            );
          })}
        </div>
      </div>
      <div className={`absolute bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-surface-raised px-1.5 py-0.5 shadow-sm ${panelOpen ? 'right-[21rem]' : 'right-3'}`}>
        <Button aria-label="Zoom out" onClick={() => canvas.zoomBy(1 / 1.2)} size="sm" variant="ghost">
          -
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted">
          {Math.round(transform.scale * 100)}%
        </span>
        <Button aria-label="Zoom in" onClick={() => canvas.zoomBy(1.2)} size="sm" variant="ghost">
          +
        </Button>
        <Button aria-label="Zoom to fit" onClick={canvas.fit} size="sm" title="Fit to view" variant="ghost">
          {'⛶'}
        </Button>
      </div>
      <Minimap
        onCenter={canvas.centerOn}
        rects={Object.values(canvas.rects)}
        transform={transform}
        viewport={canvas.viewportSize()}
      />
    </div>
  );
}
