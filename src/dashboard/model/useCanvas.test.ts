import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ZOOM_MAX, ZOOM_MIN } from "./geometry";
import { DEFAULT_LAYOUTS, loadLayout, saveLayout } from "./layout";
import { useCanvas } from "./useCanvas";

/** Force the reduced-motion media query to a fixed result for one test. */
function mockReducedMotion(reduced: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function pointerEvent(
  overrides: Partial<{
    button: number;
    clientX: number;
    clientY: number;
    pointerId: number;
  }> = {},
) {
  const element = {
    setPointerCapture: () => undefined,
  };
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    target: element,
    currentTarget: element,
    stopPropagation: () => undefined,
    ...overrides,
  } as unknown as import("react").PointerEvent<HTMLElement>;
}

describe("useCanvas", () => {
  beforeEach(() => localStorage.clear());

  it("loads default positions for every visible table per mode", () => {
    const collapsed = renderHook(() => useCanvas("collapsed"));
    expect(Object.keys(collapsed.result.current.positions)).toHaveLength(6);
    const expanded = renderHook(() => useCanvas("expanded"));
    expect(Object.keys(expanded.result.current.positions)).toHaveLength(9);
  });

  it("clamps zoom in both directions", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    act(() => result.current.zoomBy(1000));
    expect(result.current.transform.scale).toBe(ZOOM_MAX);
    act(() => result.current.zoomBy(0.00001));
    expect(result.current.transform.scale).toBe(ZOOM_MIN);
  });

  it("resets positions to the curated defaults", () => {
    saveLayout("collapsed", {
      ...DEFAULT_LAYOUTS.collapsed,
      Asset: { x: 5, y: 5 },
    });
    const { result } = renderHook(() => useCanvas("collapsed"));
    expect(result.current.positions.Asset).toEqual({ x: 5, y: 5 });
    act(() => result.current.reset());
    expect(result.current.positions.Asset).toEqual(
      DEFAULT_LAYOUTS.collapsed.Asset,
    );
  });

  it("builds rects that pair positions with card sizes", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    expect(result.current.rects.Asset).toMatchObject({
      width: 240,
      height: 248,
    });
  });

  it("suppresses click selection only after a real drag", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    act(() => result.current.startCardDrag("Asset")(pointerEvent()));
    act(() =>
      result.current.onCardDragMove(pointerEvent({ clientX: 2, clientY: 1 })),
    );
    act(() => result.current.onCardDragEnd());
    expect(result.current.wasDragged()).toBe(false);

    act(() => result.current.startCardDrag("Asset")(pointerEvent()));
    act(() =>
      result.current.onCardDragMove(pointerEvent({ clientX: 30, clientY: 20 })),
    );
    act(() => result.current.onCardDragEnd());
    expect(result.current.wasDragged()).toBe(true);
    expect(result.current.wasDragged()).toBe(false);
  });

  it("persists positions on drag end under the active mode", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const before = result.current.positions.Asset!;
    const scale = result.current.transform.scale;
    act(() => result.current.startCardDrag("Asset")(pointerEvent()));
    act(() =>
      result.current.onCardDragMove(pointerEvent({ clientX: 50, clientY: 40 })),
    );
    act(() => result.current.onCardDragEnd());
    expect(result.current.positions.Asset!.x).toBeCloseTo(
      before.x + 50 / scale,
      6,
    );
    expect(result.current.positions.Asset!.y).toBeCloseTo(
      before.y + 40 / scale,
      6,
    );
    expect(loadLayout("collapsed").Asset!.x).toBeCloseTo(
      before.x + 50 / scale,
      6,
    );
    expect(loadLayout("collapsed").Asset!.y).toBeCloseTo(
      before.y + 40 / scale,
      6,
    );
  });

  it("keeps the drag scale frozen even if zoom changes mid gesture", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const before = result.current.positions.Asset!;
    const scale = result.current.transform.scale;
    act(() => result.current.startCardDrag("Asset")(pointerEvent()));
    act(() => result.current.zoomBy(2));
    act(() =>
      result.current.onCardDragMove(pointerEvent({ clientX: 100, clientY: 0 })),
    );
    act(() => result.current.onCardDragEnd());
    expect(result.current.positions.Asset!.x).toBeCloseTo(
      before.x + 100 / scale,
      6,
    );
    expect(result.current.positions.Asset!.y).toBeCloseTo(before.y, 6);
  });

  it("ignores pan moves without a pan start", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const before = result.current.transform;
    act(() =>
      result.current.onPanMove(pointerEvent({ clientX: 80, clientY: 80 })),
    );
    expect(result.current.transform).toEqual(before);
  });

  it("centers instantly when called without animation", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const scale = result.current.transform.scale;
    act(() => result.current.centerOn({ x: 100, y: 200 }));
    // Fallback viewport is 1100 x 720, so the world point lands at the center.
    expect(result.current.transform.x).toBeCloseTo(1100 / 2 - 100 * scale, 6);
    expect(result.current.transform.y).toBeCloseTo(720 / 2 - 200 * scale, 6);
  });

  it("zooms by the pinch distance ratio between two fingers", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const startScale = result.current.transform.scale;
    act(() =>
      result.current.onCanvasPointerDown(
        pointerEvent({ pointerId: 1, clientX: 0, clientY: 0 }),
      ),
    );
    act(() =>
      result.current.onCanvasPointerDown(
        pointerEvent({ pointerId: 2, clientX: 100, clientY: 0 }),
      ),
    );
    // Spread the fingers from 100px to 200px apart: a 2x pinch.
    act(() =>
      result.current.onCanvasPointerMove(
        pointerEvent({ pointerId: 2, clientX: 200, clientY: 0 }),
      ),
    );
    expect(result.current.transform.scale).toBeCloseTo(
      Math.min(startScale * 2, ZOOM_MAX),
      6,
    );
  });

  it("stops zooming once a finger lifts and only one remains", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    act(() =>
      result.current.onCanvasPointerDown(
        pointerEvent({ pointerId: 1, clientX: 0, clientY: 0 }),
      ),
    );
    act(() =>
      result.current.onCanvasPointerDown(
        pointerEvent({ pointerId: 2, clientX: 100, clientY: 0 }),
      ),
    );
    act(() =>
      result.current.onCanvasPointerMove(
        pointerEvent({ pointerId: 2, clientX: 200, clientY: 0 }),
      ),
    );
    const afterPinch = result.current.transform.scale;
    act(() => result.current.onCanvasPointerUp(pointerEvent({ pointerId: 2 })));
    // A single remaining finger moving must not keep zooming.
    act(() =>
      result.current.onCanvasPointerMove(
        pointerEvent({ pointerId: 1, clientX: 400, clientY: 0 }),
      ),
    );
    expect(result.current.transform.scale).toBe(afterPinch);
  });

  it("centers within the visible canvas when a right inset is given", () => {
    const { result } = renderHook(() => useCanvas("collapsed"));
    const scale = result.current.transform.scale;
    // The explorer panel covers 320px on the right. With that inset the world
    // point lands at the centre of the remaining visible canvas, so a glided-to
    // node is no longer hidden behind the panel.
    act(() => result.current.centerOn({ x: 100, y: 200 }, { insetRight: 320 }));
    expect(result.current.transform.x).toBeCloseTo(
      (1100 - 320) / 2 - 100 * scale,
      6,
    );
    expect(result.current.transform.y).toBeCloseTo(720 / 2 - 200 * scale, 6);
  });

  it("falls back to an instant center under reduced motion even when animation is asked for", () => {
    const restore = mockReducedMotion(true);
    try {
      const { result } = renderHook(() => useCanvas("collapsed"));
      const scale = result.current.transform.scale;
      // Animate is requested, but reduced motion forces the instant snap, so the
      // transform lands on the centered target synchronously with no tween.
      act(() => result.current.centerOn({ x: 100, y: 200 }, { animate: true }));
      expect(result.current.transform.x).toBeCloseTo(1100 / 2 - 100 * scale, 6);
      expect(result.current.transform.y).toBeCloseTo(720 / 2 - 200 * scale, 6);
    } finally {
      restore();
    }
  });
});
