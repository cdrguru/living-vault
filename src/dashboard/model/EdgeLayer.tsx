import { useMemo } from 'react';

import type { VaultDataset } from '@/data';

import { edgeStrokeWidth } from './edgeWeight';
import { edgeGeometry, selfLoopGeometry, type Rect } from './geometry';
import { RELATIONSHIPS, type EdgeDef, type RelationshipId, type TableId } from './modelMeta';
import { Tip } from './Tip';

export function EdgeLayer({
  dataset,
  edges,
  hoveredTable,
  onSelectRelationship,
  rects,
  selectedRelationship,
}: {
  dataset?: VaultDataset;
  edges: EdgeDef[];
  hoveredTable: TableId | null;
  onSelectRelationship: (id: RelationshipId) => void;
  rects: Partial<Record<TableId, Rect>>;
  selectedRelationship: RelationshipId | null;
}) {
  const focusActive = hoveredTable !== null || selectedRelationship !== null;

  // Live link counts depend only on the dataset and the visible edge set, not on
  // pan, zoom, or hover, so memoize them off the per-frame render path.
  const countByEdge = useMemo(() => {
    if (!dataset) return null;
    const counts: Record<string, number> = {};
    for (const edge of edges) counts[edge.id] = RELATIONSHIPS[edge.relationship].count(dataset);
    return counts;
  }, [dataset, edges]);

  const drawn = edges.flatMap((edge) => {
    const from = rects[edge.from];
    const to = rects[edge.to];
    if (!from || !to) return [];
    const geo = edge.selfLoop ? selfLoopGeometry(from) : edgeGeometry(from, to, edge.offset ?? 0);
    const active =
      hoveredTable === edge.from ||
      hoveredTable === edge.to ||
      selectedRelationship === edge.relationship;
    const count = countByEdge ? countByEdge[edge.id] : null;
    return [{ active, count, dim: focusActive && !active, edge, geo }];
  });

  const counts = drawn.map((item) => item.count).filter((count): count is number => count !== null);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const maxCount = counts.length ? Math.max(...counts) : 0;

  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        height="1"
        width="1"
      >
        {drawn.map(({ active, count, dim, edge, geo }) => (
          <g className={dim ? 'opacity-25' : undefined} key={edge.id}>
            {/*
             * A transparent, constant-width hit ribbon over the edge path. It
             * makes every relationship selectable by clicking its line, not just
             * the ones that happen to carry a via pill. non-scaling-stroke keeps
             * the target a comfortable ~16px regardless of zoom. aria-hidden and
             * non-focusable: keyboard users still reach relationships through the
             * explorer panel, the via pills, and the sr-only relationship list.
             */}
            <path
              aria-hidden="true"
              className="cursor-pointer"
              d={geo.path}
              data-edge-hit={edge.id}
              fill="none"
              onClick={() => onSelectRelationship(edge.relationship)}
              stroke="transparent"
              strokeWidth={16}
              style={{ pointerEvents: 'stroke' }}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geo.path}
              fill="none"
              stroke={active ? 'var(--accent)' : 'var(--chart-axis)'}
              strokeDasharray={edge.dashed ? '6 4' : undefined}
              strokeWidth={
                count !== null ? edgeStrokeWidth(count, minCount, maxCount, active) : active ? 2 : 1.5
              }
            />
            {!edge.selfLoop && !(edge.pill && edge.pillIsCardinality) && (
              <>
                <text
                  fill={active ? "var(--accent)" : "var(--chart-axis)"}
                  fontSize="13"
                  fontWeight="600"
                  textAnchor={geo.fromLabel.anchor}
                  x={geo.fromLabel.x}
                  y={geo.fromLabel.y}
                >
                  {edge.fromEnd}
                </text>
                <text
                  fill={active ? "var(--accent)" : "var(--chart-axis)"}
                  fontSize="13"
                  fontWeight="600"
                  textAnchor={geo.toLabel.anchor}
                  x={geo.toLabel.x}
                  y={geo.toLabel.y}
                >
                  {edge.toEnd}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      {drawn
        .filter(({ edge }) => edge.pill)
        .map(({ dim, edge, geo }) => (
          <div
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${dim ? 'opacity-25' : ''}`}
            key={`${edge.id}-pill`}
            style={{ left: geo.labelPoint.x, top: geo.labelPoint.y }}
          >
            <Tip label={RELATIONSHIPS[edge.relationship].explanation}>
              <button
                className="whitespace-nowrap rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-accent-strong shadow-sm hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onSelectRelationship(edge.relationship)}
                type="button"
              >
                {edge.pill}
              </button>
            </Tip>
          </div>
        ))}
    </>
  );
}
