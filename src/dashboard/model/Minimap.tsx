import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { worldBounds, type Point, type Rect, type Size, type Transform } from './geometry';

function minimapToWorld(
  clientX: number,
  clientY: number,
  box: DOMRect,
  bounds: Rect
): Point {
  const scale = Math.min(box.width / bounds.width, box.height / bounds.height);
  const offsetX = (box.width - bounds.width * scale) / 2;
  const offsetY = (box.height - bounds.height * scale) / 2;
  return {
    x: bounds.x + (clientX - box.left - offsetX) / scale,
    y: bounds.y + (clientY - box.top - offsetY) / scale,
  };
}

export function Minimap({
  onCenter,
  rects,
  transform,
  viewport,
}: {
  onCenter: (world: Point) => void;
  rects: Rect[];
  transform: Transform;
  viewport: Size;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const bounds = worldBounds(rects, 80);
  const view: Rect = {
    x: -transform.x / transform.scale,
    y: -transform.y / transform.scale,
    width: viewport.width / transform.scale,
    height: viewport.height / transform.scale,
  };

  function centerFromEvent(event: ReactPointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    onCenter(minimapToWorld(event.clientX, event.clientY, box, bounds));
  }

  return (
    <svg
      aria-label="Minimap"
      className="absolute bottom-3 left-3 h-28 w-44 cursor-pointer rounded-md border border-border bg-surface-inset/90 shadow-sm"
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        centerFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) centerFromEvent(event);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      preserveAspectRatio="xMidYMid meet"
      ref={svgRef}
      role="img"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
    >
      {rects.map((rect, index) => (
        <rect
          fill="var(--border-strong)"
          height={rect.height}
          key={index}
          rx={8}
          width={rect.width}
          x={rect.x}
          y={rect.y}
        />
      ))}
      <rect
        fill="none"
        height={view.height}
        stroke="var(--accent)"
        strokeWidth={Math.max(2, bounds.width / 80)}
        width={view.width}
        x={view.x}
        y={view.y}
      />
    </svg>
  );
}
