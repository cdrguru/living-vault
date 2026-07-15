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
} from "@/dashboard/model/geometry";

import {
  NODE_SIZE,
  loadLayout,
  resetLayout,
  saveLayout,
  type DependencyLayout,
} from "./dependencyLayout";

/**
 * Pan, zoom, fit, and per-node drag for the dependency node-link graph. It is the
 * monitor canvas hook's twin, sharing the same geometry math (fitToView, zoomAt)
 * and the same gesture model, keyed by asset id and reading the dependency layout
 * (its own storage key). The model engine's geometry is reused verbatim; only the
 * layout source differs.
 */

const FALLBACK_VIEWPORT: Size = { width: 1100, height: 720 };
const DRAG_THRESHOLD = 4;

function viewportSizeOf(element: HTMLElement | null): Size {
  if (!element) return FALLBACK_VIEWPORT;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0
    ? { width: box.width, height: box.height }
    : FALLBACK_VIEWPORT;
}

interface NodeDrag {
  id: string;
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

export function useDependencyCanvas(nodeIds: string[]) {
  // A stable join key so the layout effect only re-runs when the node SET changes,
  // not on every render that produces a fresh array.
  const idsKey = nodeIds.join("|");

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
  const [positions, setPositions] = useState<DependencyLayout>(() =>
    loadLayout(nodeIds),
  );
  const [dragging, setDragging] = useState<string | null>(null);

  const transformRef = useRef(transform);
  const positionsRef = useRef(positions);
  const nodeDragRef = useRef<NodeDrag | null>(null);
  const panRef = useRef<Pan | null>(null);
  const movedRef = useRef(false);
  const flyTweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const rects = useMemo(() => {
    const out: Record<string, Rect> = {};
    for (const id of nodeIds) {
      const position = positions[id];
      if (position) out[id] = { ...position, ...NODE_SIZE };
    }
    return out;
    // idsKey stands in for nodeIds so a new array of the same ids does not churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, positions]);
  const rectsRef = useRef(rects);
  useEffect(() => {
    rectsRef.current = rects;
  }, [rects]);

  // Reload the grid or saved layout and refit whenever the node set or the
  // viewport element changes.
  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    const layout = loadLayout(ids);
    setPositions(layout);
    const layoutRects = ids
      .map((id) => layout[id])
      .filter((position): position is { x: number; y: number } =>
        Boolean(position),
      )
      .map((position) => ({ ...position, ...NODE_SIZE }));
    if (layoutRects.length > 0) {
      setTransform(fitToView(layoutRects, viewportSizeOf(viewportEl)));
    }
  }, [idsKey, viewportEl]);

  const viewportSize = useCallback(
    () => viewportSizeOf(elementRef.current),
    [],
  );

  const fit = useCallback(() => {
    const all = Object.values(rectsRef.current);
    if (all.length === 0) return;
    setTransform(fitToView(all, viewportSizeOf(elementRef.current)));
  }, []);

  const zoomBy = useCallback((factor: number, center?: Point) => {
    const size = viewportSizeOf(elementRef.current);
    const cursor = center ?? { x: size.width / 2, y: size.height / 2 };
    setTransform((current) => zoomAt(current, cursor, factor));
  }, []);

  // Recenter the world on a point. An animated call glides the pan over DUR.md;
  // an instant call (or reduced motion) snaps. Mirrors model/useCanvas centerOn:
  // transform only, scale held, so a fly-to recenters without zooming.
  const centerOn = useCallback(
    (world: Point, options?: { animate?: boolean }) => {
      const size = viewportSizeOf(elementRef.current);
      const scale = transformRef.current.scale;
      const target = {
        x: size.width / 2 - world.x * scale,
        y: size.height / 2 - world.y * scale,
      };
      if (!options?.animate || prefersReduced()) {
        flyTweenRef.current?.kill();
        flyTweenRef.current = null;
        setTransform((current) => ({ ...current, x: target.x, y: target.y }));
        return;
      }
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

  // Kill any in-flight fly-to on unmount so it never writes to an unmounted tree.
  useEffect(() => {
    return () => {
      flyTweenRef.current?.kill();
      flyTweenRef.current = null;
    };
  }, []);

  const centerOnNode = useCallback(
    (id: string) => {
      const rect = rectsRef.current[id];
      if (!rect) return;
      centerOn(
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        { animate: true },
      );
    },
    [centerOn],
  );

  const reset = useCallback(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    setPositions(resetLayout(ids));
  }, [idsKey]);

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

  /** Nudge the viewport by a screen-space delta, used by arrow-key panning. */
  const panBy = useCallback((dx: number, dy: number) => {
    setTransform((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  }, []);

  const startNodeDrag = useCallback(
    (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const origin = positionsRef.current[id];
      if (!origin) return;
      nodeDragRef.current = {
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

  const onNodeDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = nodeDragRef.current;
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

  const onNodeDragEnd = useCallback(() => {
    if (!nodeDragRef.current) return;
    nodeDragRef.current = null;
    setDragging(null);
    saveLayout(positionsRef.current);
  }, []);

  const wasDragged = useCallback(() => {
    const moved = movedRef.current;
    movedRef.current = false;
    return moved;
  }, []);

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
    centerOnNode,
    dragging,
    fit,
    onNodeDragEnd,
    onNodeDragMove,
    onPanEnd,
    onPanMove,
    onPanStart,
    panBy,
    positions,
    rects,
    reset,
    startNodeDrag,
    transform,
    viewportRef,
    viewportSize,
    wasDragged,
    zoomBy,
  };
}

export type DependencyCanvasApi = ReturnType<typeof useDependencyCanvas>;
