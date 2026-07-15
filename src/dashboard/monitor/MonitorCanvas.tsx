import { type KeyboardEvent } from "react";

import { Button } from "@/dashboard/components/Button";
import { edgeGeometry, type Rect } from "@/dashboard/model/geometry";
import { Minimap } from "@/dashboard/model/Minimap";
import type { UsageSummary } from "@/data/metrics";

import { encodeNode, type LensId } from "./lenses";
import type { MonitorEdge, MonitorNode } from "./monitorMeta";
import { TONE_CLASS } from "./toneClass";
import { ToneGlyph } from "./ToneGlyph";
import type { MonitorCanvasApi } from "./useMonitorCanvas";

/** Edge stroke per kind. requires and member-of solid, tagged and duplicate dashed. */
function edgeStroke(
  edge: MonitorEdge,
  active: boolean,
): { stroke: string; dash?: string } {
  if (edge.kind === "duplicate")
    return { stroke: "var(--warning)", dash: "5 4" };
  if (active) return { stroke: "var(--accent)" };
  return { stroke: "var(--chart-axis)", dash: edge.dashed ? "5 4" : undefined };
}

export function MonitorCanvas({
  canvas,
  nodes,
  edges,
  usageByAsset,
  lens,
  showTagged,
  filterMatch,
  focusIds,
  isolate,
  selectedId,
  onSelectNode,
}: {
  canvas: MonitorCanvasApi;
  nodes: MonitorNode[];
  edges: MonitorEdge[];
  usageByAsset: Map<string, UsageSummary>;
  lens: LensId;
  showTagged: boolean;
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

  // requires and duplicate edges are sparse and structural, so they always show.
  // member-of and tagged form a dense relationship mesh (every pair within a
  // bundle or shared tag), which crowds the grid into an unreadable hairball.
  // That mesh renders only when the user opts in with the Tag edges toggle, or
  // when an edge belongs to the selected node's focused neighborhood.
  const drawnEdges = edges.flatMap((edge) => {
    const from = canvas.rects[edge.from];
    const to = canvas.rects[edge.to];
    if (!from || !to) return [];
    const inFocus =
      focusIds !== null && focusIds.has(edge.from) && focusIds.has(edge.to);
    const dim = focusIds !== null && !inFocus;
    // Isolate hides out-of-focus edges entirely; otherwise they dim.
    if (isolate && dim) return [];
    const isMesh = edge.kind === "member-of" || edge.kind === "tagged";
    if (isMesh && !showTagged && !inFocus) return [];
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
      aria-label="Asset topology canvas. Use plus and minus to zoom, 0 to fit."
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
          {drawnEdges.map(({ edge, active, dim, geo }) => {
            const stroke = edgeStroke(edge, active);
            return (
              <path
                d={geo.path}
                fill="none"
                key={edge.id}
                stroke={stroke.stroke}
                strokeDasharray={stroke.dash}
                strokeWidth={active ? 2.2 : 1.4}
                style={{ opacity: active ? 1 : dim ? 0.22 : 0.5 }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-auto">
          {nodes.map((node) => {
            const rect = canvas.rects[node.id];
            if (!rect) return null;
            const usage = usageByAsset.get(node.id);
            const encoding = encodeNode(lens, node, usage);
            const tone = TONE_CLASS[encoding.tone];
            const filteredOut = !filterMatch.has(node.id);
            const outOfFocus = focusIds !== null && !focusIds.has(node.id);
            if (isolate && outOfFocus) return null;
            const dimmed =
              isolate && focusIds !== null ? false : filteredOut || outOfFocus;
            const selected = selectedId === node.id;
            return (
              <button
                aria-label={`${node.name}, ${node.type}. ${encoding.caption}.`}
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
                  transform: `scale(${encoding.scale})`,
                  opacity: dimmed ? undefined : encoding.opacity,
                }}
                type="button"
              >
                <span className={`flex items-center gap-2 ${tone.text}`}>
                  <ToneGlyph glyph={encoding.glyph} />
                  <span className="truncate text-base font-semibold leading-tight">
                    {node.name}
                  </span>
                </span>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-subtle">
                  {node.type}
                </span>
                <span className={`mt-auto text-sm font-medium ${tone.text}`}>
                  {node.quadrant}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-full border border-border bg-surface-raised px-1.5 py-0.5 shadow-sm">
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
