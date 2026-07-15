import { describe, expect, it } from 'vitest';

import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampScale,
  edgeGeometry,
  fitToView,
  screenToWorld,
  selfLoopGeometry,
  worldBounds,
  zoomAt,
  type Rect,
} from './geometry';

const left: Rect = { x: 0, y: 0, width: 100, height: 50 };
const right: Rect = { x: 300, y: 0, width: 100, height: 50 };
const below: Rect = { x: 0, y: 300, width: 100, height: 50 };

describe('edgeGeometry', () => {
  it('anchors horizontal neighbors on facing sides', () => {
    const geo = edgeGeometry(left, right);
    expect(geo.fromPoint).toEqual({ x: 100, y: 25 });
    expect(geo.toPoint).toEqual({ x: 300, y: 25 });
  });

  it('anchors vertical neighbors on facing sides', () => {
    const geo = edgeGeometry(left, below);
    expect(geo.fromPoint).toEqual({ x: 50, y: 50 });
    expect(geo.toPoint).toEqual({ x: 50, y: 300 });
  });

  it('applies a perpendicular offset to parallel edges', () => {
    const a = edgeGeometry(left, right, -20);
    const b = edgeGeometry(left, right, 20);
    expect(a.fromPoint.y).toBe(5);
    expect(b.fromPoint.y).toBe(45);
    expect(a.path).not.toBe(b.path);
  });

  it('places the label at the cubic midpoint', () => {
    const geo = edgeGeometry(left, right);
    expect(geo.labelPoint.x).toBeGreaterThan(100);
    expect(geo.labelPoint.x).toBeLessThan(300);
    expect(geo.labelPoint.y).toBe(25);
  });

  it('places endpoint labels outward from the card sides', () => {
    const geo = edgeGeometry(left, right);
    expect(geo.fromLabel).toEqual({ x: 108, y: 19, anchor: 'start' });
    expect(geo.toLabel).toEqual({ x: 292, y: 19, anchor: 'end' });
    const vertical = edgeGeometry(left, below);
    expect(vertical.fromLabel).toEqual({ x: 56, y: 64, anchor: 'start' });
    expect(vertical.toLabel).toEqual({ x: 56, y: 292, anchor: 'start' });
  });
});

describe('selfLoopGeometry', () => {
  it('starts on the top edge and ends on the left edge', () => {
    const rect: Rect = { x: 400, y: 200, width: 240, height: 200 };
    const geo = selfLoopGeometry(rect);
    expect(geo.fromPoint).toEqual({ x: 428, y: 200 });
    expect(geo.toPoint).toEqual({ x: 400, y: 232 });
    expect(geo.labelPoint.x).toBeLessThan(rect.x);
    expect(geo.labelPoint.y).toBeLessThan(rect.y);
  });
});

describe('zoom', () => {
  it('clamps scale to the allowed range', () => {
    expect(clampScale(99)).toBe(ZOOM_MAX);
    expect(clampScale(0.01)).toBe(ZOOM_MIN);
    expect(clampScale(1)).toBe(1);
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const t = { x: 40, y: 60, scale: 1 };
    const cursor = { x: 500, y: 300 };
    const before = screenToWorld(t, cursor);
    const after = screenToWorld(zoomAt(t, cursor, 1.5), cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('keeps the cursor world point fixed even when the scale clamps', () => {
    const t = { x: 40, y: 60, scale: 2 };
    const cursor = { x: 500, y: 300 };
    const before = screenToWorld(t, cursor);
    const after = screenToWorld(zoomAt(t, cursor, 10), cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('returns ZOOM_MIN for non-finite scales', () => {
    expect(clampScale(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(ZOOM_MIN);
  });
});

describe('worldBounds and conversions', () => {
  it('returns a unit rect for an empty list', () => {
    expect(worldBounds([])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('screenToWorld round-trips a known point', () => {
    const t = { x: 25, y: -40, scale: 1.6 };
    const world = screenToWorld(t, { x: 25 + 10 * 1.6, y: -40 + 20 * 1.6 });
    expect(world.x).toBeCloseTo(10, 6);
    expect(world.y).toBeCloseTo(20, 6);
  });

  it('breaks 45 degree ties horizontally when picking anchor sides', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const diagonal: Rect = { x: 200, y: 200, width: 100, height: 100 };
    const geo = edgeGeometry(a, diagonal);
    expect(geo.fromPoint).toEqual({ x: 100, y: 50 });
    expect(geo.toPoint).toEqual({ x: 200, y: 250 });
  });
});

describe('fitToView', () => {
  it('centers the bounds and never exceeds 1x', () => {
    const rects: Rect[] = [left, right];
    const t = fitToView(rects, { width: 800, height: 600 });
    expect(t.scale).toBeLessThanOrEqual(1);
    const bounds = worldBounds(rects, 0);
    const centerScreenX = bounds.x * t.scale + t.x + (bounds.width * t.scale) / 2;
    expect(centerScreenX).toBeCloseTo(400, 4);
  });

  it('scales down to contain large bounds', () => {
    const rects: Rect[] = [{ x: 0, y: 0, width: 4000, height: 100 }];
    const t = fitToView(rects, { width: 800, height: 600 });
    expect(t.scale).toBeLessThan(1);
    expect(t.scale).toBeGreaterThanOrEqual(ZOOM_MIN);
  });
});
