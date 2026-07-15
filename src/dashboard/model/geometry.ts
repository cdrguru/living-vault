export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface AnchorLabel extends Point {
  anchor: 'start' | 'end';
}

export interface EdgeGeometry {
  path: string;
  fromPoint: Point;
  toPoint: Point;
  labelPoint: Point;
  fromLabel: AnchorLabel;
  toLabel: AnchorLabel;
}

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.5;

type Side = 'left' | 'right' | 'top' | 'bottom';

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function pickSide(from: Rect, to: Rect): Side {
  const a = rectCenter(from);
  const b = rectCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function sideAnchor(rect: Rect, side: Side): Point {
  switch (side) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
}

function shiftPerpendicular(point: Point, side: Side, offset: number): Point {
  if (side === 'left' || side === 'right') return { x: point.x, y: point.y + offset };
  return { x: point.x + offset, y: point.y };
}

function controlPoint(point: Point, side: Side, reach: number): Point {
  switch (side) {
    case 'left':
      return { x: point.x - reach, y: point.y };
    case 'right':
      return { x: point.x + reach, y: point.y };
    case 'top':
      return { x: point.x, y: point.y - reach };
    case 'bottom':
      return { x: point.x, y: point.y + reach };
  }
}

function anchorLabel(point: Point, side: Side): AnchorLabel {
  switch (side) {
    case 'right':
      return { x: point.x + 8, y: point.y - 6, anchor: 'start' };
    case 'left':
      return { x: point.x - 8, y: point.y - 6, anchor: 'end' };
    case 'bottom':
      return { x: point.x + 6, y: point.y + 14, anchor: 'start' };
    case 'top':
      return { x: point.x + 6, y: point.y - 8, anchor: 'start' };
  }
}

function cubicMidpoint(a: Point, c1: Point, c2: Point, b: Point): Point {
  return {
    x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
    y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
  };
}

export function edgeGeometry(from: Rect, to: Rect, offset = 0): EdgeGeometry {
  const fromSide = pickSide(from, to);
  const toSide = pickSide(to, from);
  const a = shiftPerpendicular(sideAnchor(from, fromSide), fromSide, offset);
  const b = shiftPerpendicular(sideAnchor(to, toSide), toSide, offset);
  const reach = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) / 2.5);
  const c1 = controlPoint(a, fromSide, reach);
  const c2 = controlPoint(b, toSide, reach);
  return {
    path: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    fromPoint: a,
    toPoint: b,
    labelPoint: cubicMidpoint(a, c1, c2, b),
    fromLabel: anchorLabel(a, fromSide),
    toLabel: anchorLabel(b, toSide),
  };
}

export function selfLoopGeometry(rect: Rect): EdgeGeometry {
  const a = { x: rect.x + 28, y: rect.y };
  const b = { x: rect.x, y: rect.y + 32 };
  const c1 = { x: a.x, y: a.y - 76 };
  const c2 = { x: b.x - 96, y: b.y };
  return {
    path: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    fromPoint: a,
    toPoint: b,
    labelPoint: cubicMidpoint(a, c1, c2, b),
    fromLabel: anchorLabel(a, 'top'),
    toLabel: anchorLabel(b, 'left'),
  };
}

export function zoomAt(transform: Transform, cursor: Point, factor: number): Transform {
  const scale = clampScale(transform.scale * factor);
  const k = scale / transform.scale;
  return {
    x: cursor.x - k * (cursor.x - transform.x),
    y: cursor.y - k * (cursor.y - transform.y),
    scale,
  };
}

export function screenToWorld(transform: Transform, point: Point): Point {
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale,
  };
}

export function worldBounds(rects: Rect[], margin = 0): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 1, height: 1 };
  const minX = Math.min(...rects.map((r) => r.x)) - margin;
  const minY = Math.min(...rects.map((r) => r.y)) - margin;
  const maxX = Math.max(...rects.map((r) => r.x + r.width)) + margin;
  const maxY = Math.max(...rects.map((r) => r.y + r.height)) + margin;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function fitToView(rects: Rect[], viewport: Size, padding = 48): Transform {
  const bounds = worldBounds(rects, 0);
  const scale = clampScale(
    Math.min(
      (viewport.width - padding * 2) / bounds.width,
      (viewport.height - padding * 2) / bounds.height,
      1
    )
  );
  return {
    x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}
