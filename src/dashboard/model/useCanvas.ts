import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import gsap from "gsap";

import { DUR, EASE } from "@/motion/tokens";
import { prefersReduced } from "@/motion/useReducedMotion";

import {
  fitToView,
  zoomAt,
  type Point,
  type Rect,
  type Size,
  type Transform,
} from "./geometry";
import {
  CARD_SIZES,
  loadLayout,
  resetLayout,
  saveLayout,
  type Layout,
} from "./layout";
import { visibleTables, type LayoutMode, type TableId } from "./modelMeta";

const FALLBACK_VIEWPORT: Size = { width: 1100, height: 720 };
const DRAG_THRESHOLD = 4;

function viewportSizeOf(element: HTMLElement | null): Size {
  if (!element) return FALLBACK_VIEWPORT;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0
    ? { width: box.width, height: box.height }
    : FALLBACK_VIEWPORT;
}

interface CardDrag {
  id: TableId;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  scale: number;
}

interface Pan {
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

export function useCanvas(mode: LayoutMode) {
  // Callback ref instead of a plain ref object: ModelPage renders a loading line
  // until the dataset arrives, so the viewport element appears after mount and
  // effects must re-run when it does.
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
    setViewportEl(element);
  }, []);
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [positions, setPositions] = useState<Layout>(() => loadLayout(mode));
  const [dragging, setDragging] = useState<TableId | null>(null);

  const transformRef = useRef(transform);
  const positionsRef = useRef(positions);
  const cardDragRef = useRef<CardDrag | null>(null);
  const panRef = useRef<Pan | null>(null);
  // Active touch points and the live pinch gesture, for two-finger zoom.
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ prevDist: number } | null>(null);
  const movedRef = useRef(false);
  // The active fly-to tween, killed before a new fly-to so two glides never
  // fight over the viewport transform.
  const flyTweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const rects = useMemo(() => {
    const out: Partial<Record<TableId, Rect>> = {};
    for (const id of visibleTables(mode)) {
      const position = positions[id];
      if (position) out[id] = { ...position, ...CARD_SIZES[id] };
    }
    return out;
  }, [mode, positions]);
  const rectsRef = useRef(rects);
  useEffect(() => {
    rectsRef.current = rects;
  }, [rects]);

  // Reload the curated or saved layout and refit whenever the mode flips or the
  // viewport element first mounts.
  useEffect(() => {
    const layout = loadLayout(mode);
    setPositions(layout);
    const layoutRects = visibleTables(mode).map((id) => ({
      ...layout[id]!,
      ...CARD_SIZES[id],
    }));
    setTransform(fitToView(layoutRects, viewportSizeOf(viewportEl)));
  }, [mode, viewportEl]);

  const viewportSize = useCallback(
    () => viewportSizeOf(elementRef.current),
    [],
  );

  const fit = useCallback(() => {
    setTransform(
      fitToView(
        Object.values(rectsRef.current) as Rect[],
        viewportSizeOf(elementRef.current),
      ),
    );
  }, []);

  const zoomBy = useCallback((factor: number, center?: Point) => {
    const size = viewportSizeOf(elementRef.current);
    const cursor = center ?? { x: size.width / 2, y: size.height / 2 };
    setTransform((current) => zoomAt(current, cursor, factor));
  }, []);

  const centerOn = useCallback(
    (world: Point, options?: { animate?: boolean; insetRight?: number }) => {
      const size = viewportSizeOf(elementRef.current);
      // The explorer panel overlays the right edge, so center within the
      // visible width (total minus the panel inset) to keep the focused node
      // out from under the panel.
      const insetRight = options?.insetRight ?? 0;
      const target = {
        x: (size.width - insetRight) / 2 - world.x * transformRef.current.scale,
        y: size.height / 2 - world.y * transformRef.current.scale,
      };

      // Reduced motion (or an explicit non-animated call) snaps instantly. The
      // node still lands centered, just without the glide.
      if (!options?.animate || prefersReduced()) {
        flyTweenRef.current?.kill();
        flyTweenRef.current = null;
        setTransform((current) => ({ ...current, x: target.x, y: target.y }));
        return;
      }

      // Tween a proxy that mirrors the current pan and push each frame back into
      // React state. Transform only, so the glide stays cheap. Scale is held, so
      // a fly-to recenters without zooming.
      flyTweenRef.current?.kill();
      const proxy = { x: transformRef.current.x, y: transformRef.current.y };
      flyTweenRef.current = gsap.to(proxy, {
        x: target.x,
        y: target.y,
        duration: DUR.md,
        ease: EASE.inOut,
        onUpdate: () => {
          setTransform((current) => ({ ...current, x: proxy.x, y: proxy.y }));
        },
      });
    },
    [],
  );

  // Kill any in-flight fly-to tween on unmount so it never writes to an
  // unmounted component.
  useEffect(() => {
    return () => {
      flyTweenRef.current?.kill();
      flyTweenRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    setPositions(resetLayout(mode));
  }, [mode]);

  // Background pan.
  const onPanStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    panRef.current = {
      originX: transformRef.current.x,
      originY: transformRef.current.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPanMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // A pinch suspends panning so two fingers zoom instead of dragging.
    if (pinchRef.current) return;
    const pan = panRef.current;
    if (!pan) return;
    setTransform((current) => ({
      ...current,
      x: pan.originX + (event.clientX - pan.startX),
      y: pan.originY + (event.clientY - pan.startY),
    }));
  }, []);

  const onPanEnd = useCallback(() => {
    panRef.current = null;
  }, []);

  // Two-finger pinch zoom. Pointer tracking lives at the viewport level so a
  // pinch works wherever the fingers land on the canvas; the second finger
  // cancels any in-flight pan, and zoom is anchored at the finger midpoint so
  // the canvas grows around the gesture, matching wheel zoom.
  const pinchDistance = (a: Point, b: Point): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (pointersRef.current.size === 2) {
        panRef.current = null;
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = { prevDist: pinchDistance(a, b) };
      }
    },
    [],
  );

  const onCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pinchRef.current || !pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (pointersRef.current.size < 2) return;
      const [a, b] = [...pointersRef.current.values()];
      const curDist = pinchDistance(a, b);
      if (curDist === 0 || pinchRef.current.prevDist === 0) return;
      const factor = curDist / pinchRef.current.prevDist;
      pinchRef.current.prevDist = curDist;
      const box = elementRef.current?.getBoundingClientRect();
      const center = {
        x: (a.x + b.x) / 2 - (box?.left ?? 0),
        y: (a.y + b.y) / 2 - (box?.top ?? 0),
      };
      setTransform((current) => zoomAt(current, center, factor));
    },
    [],
  );

  const onCanvasPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
    },
    [],
  );

  // Card drag, attached to each card header.
  const startCardDrag = useCallback(
    (id: TableId) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const origin = positionsRef.current[id];
      if (!origin) return;
      cardDragRef.current = {
        id,
        originX: origin.x,
        originY: origin.y,
        startX: event.clientX,
        startY: event.clientY,
        scale: transformRef.current.scale,
      };
      movedRef.current = false;
      setDragging(id);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [],
  );

  const onCardDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = cardDragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) movedRef.current = true;
      const scale = drag.scale;
      setPositions((current) => ({
        ...current,
        [drag.id]: {
          x: drag.originX + dx / scale,
          y: drag.originY + dy / scale,
        },
      }));
    },
    [],
  );

  const onCardDragEnd = useCallback(() => {
    if (!cardDragRef.current) return;
    cardDragRef.current = null;
    setDragging(null);
    saveLayout(mode, positionsRef.current);
  }, [mode]);

  /** True once per drag gesture; lets the card click handler skip selection after a drag. */
  const wasDragged = useCallback(() => {
    const moved = movedRef.current;
    movedRef.current = false;
    return moved;
  }, []);

  // Wheel zoom must be non-passive to preventDefault page scroll. Depends on
  // viewportEl so the listener attaches once the canvas mounts after loading.
  useEffect(() => {
    const element = viewportEl;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const cursor = {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      };
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setTransform((current) => zoomAt(current, cursor, factor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [viewportEl]);

  return {
    centerOn,
    dragging,
    fit,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCardDragEnd,
    onCardDragMove,
    onPanEnd,
    onPanMove,
    onPanStart,
    positions,
    rects,
    reset,
    startCardDrag,
    transform,
    viewportRef,
    viewportSize,
    wasDragged,
    zoomBy,
  };
}

export type CanvasApi = ReturnType<typeof useCanvas>;
