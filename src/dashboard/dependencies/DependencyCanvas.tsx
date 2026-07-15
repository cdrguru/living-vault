import { type KeyboardEvent } from "react";

import { Button } from "@/dashboard/components/Button";
import { edgeGeometry, type Rect } from "@/dashboard/model/geometry";
import { Minimap } from "@/dashboard/model/Minimap";
import { TONE_CLASS } from "@/dashboard/monitor/toneClass";
import { TONE_GLYPH } from "@/dashboard/monitor/monitorMeta";
import { ToneGlyph } from "@/dashboard/monitor/ToneGlyph";

import type { DependencyEdge, DependencyNode } from "./dependencyMeta";
import type { DependencyCanvasApi } from "./useDependencyCanvas";

/** The arrowhead marker id, referenced by every edge's markerEnd. */
const ARROW_ID = "dependency-arrow";
const ARROW_ID_ACTIVE = "dependency-arrow-active";

export function DependencyCanvas({
  canvas,
  nodes,
  edges,
  filterMatch,
  focusIds,
  isolate,
  selectedId,
  onSelectNode,
}: {
  canvas: DependencyCanvasApi;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  /** The asset ids that pass the active filters. Dim every node not in this set. */
  filterMatch: Set<string>;
  /** The selected node's one-hop neighborhood, or null when nothing is selected. */
  focusIds: Set<string> | null;
  /** When true with a selection, hide everything outside focusIds instead of dimming it. */
  isolate: boolean;
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const { transform } = canvas;
  const gridSize = 16 * transform.scale;

  // Dependency edges are sparse and structural, so they always draw. A selection
  // focuses its one-hop neighborhood: in-focus edges go accent, out-of-focus edges
  // dim, and Isolate hides the out-of-focus edges entirely.
  const drawnEdges = edges.flatMap((edge) => {
    const from = canvas.rects[edge.from];
    const to = canvas.rects[edge.to];
    if (!from || !to) return [];
    const inFocus =
      focusIds !== null && focusIds.has(edge.from) && focusIds.has(edge.to);
    const dim = focusIds !== null && !inFocus;
    if (isolate && dim) return [];
    return [
      { edge, active: inFocus, dim, geo: edgeGeometry(from as Rect, to as Rect) },
    ];
  });

  function onNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNode(id);
    }
  }

  return (
    <div
      aria-label="Dependency graph canvas. Arrows point from a dependent asset to the asset it requires. Use plus and minus to zoom, 0 to fit."
      className="absolute inset-0 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-accent"
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelectNode(null);
      }}
      onKeyDown={(event) => {
        const STEP = 48;
        if (event.key === "+" || event.key === "=") canvas.zoomBy(1.2);
        if (event.key === "-") canvas.zoomBy(1 / 1.2);
        if (event.key === "0") canvas.fit();
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          canvas.panBy(STEP, 0);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          canvas.panBy(-STEP, 0);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          canvas.panBy(0, STEP);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          canvas.panBy(0, -STEP);
        }
      }}
      onPointerDown={canvas.onPanStart}
      onPointerMove={canvas.onPanMove}
      onPointerUp={canvas.onPanEnd}
      ref={canvas.viewportRef}
      style={{
        backgroundImage:
          "radial-gradient(var(--chart-grid) 1px, transparent 1px)",
        backgroundPosition: `${transform.x}px ${transform.y}px`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
      tabIndex={0}
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          height="1"
          width="1"
        >
          <defs>
            {/* A small filled triangle so the requires direction (from -> to) is
                visible at the dependency end of each edge. */}
            <marker
              id={ARROW_ID}
              markerHeight="7"
              markerWidth="8"
              orient="auto-start-reverse"
              refX="7"
              refY="3.5"
            >
              <path d="M0 0 L8 3.5 L0 7 z" fill="var(--chart-axis)" />
            </marker>
            <marker
              id={ARROW_ID_ACTIVE}
              markerHeight="7"
              markerWidth="8"
              orient="auto-start-reverse"
              refX="7"
              refY="3.5"
            >
              <path d="M0 0 L8 3.5 L0 7 z" fill="var(--accent)" />
            </marker>
          </defs>
          {drawnEdges.map(({ edge, active, dim, geo }) => (
            <path
              d={geo.path}
              fill="none"
              key={edge.id}
              markerEnd={`url(#${active ? ARROW_ID_ACTIVE : ARROW_ID})`}
              stroke={active ? "var(--accent)" : "var(--chart-axis)"}
              strokeWidth={active ? 2.2 : 1.4}
              style={{ opacity: active ? 1 : dim ? 0.22 : 0.5 }}
            />
          ))}
        </svg>
        <div className="pointer-events-auto">
          {nodes.map((node) => {
            const rect = canvas.rects[node.id];
            if (!rect) return null;
            const tone = TONE_CLASS[node.tone];
            const filteredOut = !filterMatch.has(node.id);
            const outOfFocus = focusIds !== null && !focusIds.has(node.id);
            if (isolate && outOfFocus) return null;
            const dimmed =
              isolate && focusIds !== null ? false : filteredOut || outOfFocus;
            const selected = selectedId === node.id;
            return (
              <button
                aria-label={`${node.name}, ${node.type}. ${node.quadrant}. Requires ${node.requiresCount}, required by ${node.requiredByCount}.`}
                aria-pressed={selected}
                className={[
                  "absolute flex select-none flex-col gap-1.5 overflow-hidden rounded-lg p-3 text-left shadow-sm ring-1 transition-opacity focus-visible:outline-2 focus-visible:outline-accent",
                  tone.surface,
                  tone.ring,
                  canvas.dragging !== node.id
                    ? "motion-safe:transition-[left,top,opacity] motion-safe:duration-300"
                    : "",
                  dimmed ? "opacity-30" : "opacity-100",
                  // A selected node lifts above the rest with a thicker accent
                  // ring and a stronger shadow, so the inspected card is obvious.
                  selected ? "z-20 shadow-lg ring-2 ring-accent" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={node.id}
                onClick={() => {
                  if (!canvas.wasDragged()) onSelectNode(node.id);
                }}
                onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                onPointerDown={canvas.startNodeDrag(node.id)}
                onPointerMove={canvas.onNodeDragMove}
                onPointerUp={canvas.onNodeDragEnd}
                style={{
                  height: rect.height,
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                }}
                type="button"
              >
                <span className={`flex items-center gap-2 ${tone.text}`}>
                  <ToneGlyph glyph={TONE_GLYPH[node.tone]} />
                  <span className="truncate text-base font-semibold leading-tight">
                    {node.name}
                  </span>
                </span>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-subtle">
                  {node.type}
                </span>
                <span className="mt-auto text-xs font-medium text-subtle">
                  {node.requiresCount} requires, {node.requiredByCount} required
                  by
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-full border border-border bg-surface-raised px-1.5 py-0.5 shadow-sm">
        <Button
          aria-label="Zoom out"
          onClick={() => canvas.zoomBy(1 / 1.2)}
          size="sm"
          variant="ghost"
        >
          -
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted">
          {Math.round(transform.scale * 100)}%
        </span>
        <Button
          aria-label="Zoom in"
          onClick={() => canvas.zoomBy(1.2)}
          size="sm"
          variant="ghost"
        >
          +
        </Button>
        <Button
          aria-label="Fit to view"
          onClick={canvas.fit}
          size="sm"
          variant="ghost"
        >
          {"⛶"}
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
