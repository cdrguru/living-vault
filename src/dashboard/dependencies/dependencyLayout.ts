import type { Size } from "@/dashboard/model/geometry";

/**
 * Layout for the dependency node-link graph. It mirrors the model and monitor
 * layouts' persistence shape (a per-id position map with a localStorage round trip
 * and per-entry fallback) but is keyed by asset id, and uses its OWN storage key so
 * it can never clobber the /model layout under 'vault.model.layout.v1' or the
 * /monitor layout under 'vault.monitor.layout.v1'.
 */

export interface NodePosition {
  x: number;
  y: number;
}

export type DependencyLayout = Record<string, NodePosition>;

/** Distinct storage key from the model and monitor canvases, as the prompt requires. */
export const STORAGE_KEY = "vault.dependencies.layout.v1";

/**
 * One node card size. Asset nodes are uniform, so the canvas tiles cleanly. The
 * card is sized to hold a larger, more legible name plus the type and quadrant
 * lines without truncating most asset names at normal zoom.
 */
export const NODE_SIZE: Size = { width: 200, height: 104 };

// Wider gaps so edges read clearly between cards and selected neighborhoods do
// not visually collide. Tuned alongside the larger NODE_SIZE above.
const COLUMN_GAP = 80;
const ROW_GAP = 72;
const MARGIN = 56;

/**
 * A deterministic grid layout: nodes are laid left to right, top to bottom in the
 * given order, wrapping at a column count derived from the node total so the grid
 * stays close to square. Pure and order-stable, so the same dataset always yields
 * the same starting map (and tests can assert exact coordinates).
 */
export function gridLayout(nodeIds: string[]): DependencyLayout {
  const layout: DependencyLayout = {};
  if (nodeIds.length === 0) return layout;
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
  const stepX = NODE_SIZE.width + COLUMN_GAP;
  const stepY = NODE_SIZE.height + ROW_GAP;
  nodeIds.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    layout[id] = { x: MARGIN + column * stepX, y: MARGIN + row * stepY };
  });
  return layout;
}

function readStored(): DependencyLayout {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as DependencyLayout;
  } catch {
    return {};
  }
}

function writeStored(layout: DependencyLayout): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Best effort: private mode or quota pressure. In-memory layout still works.
  }
}

/**
 * The grid for the given node ids, with any saved per-node override applied. An
 * override is only honored when it carries finite coordinates, so corrupt storage
 * falls back to the deterministic grid one node at a time. Nodes absent from the
 * dataset are dropped, so a removed asset cannot leave a dangling position.
 */
export function loadLayout(nodeIds: string[]): DependencyLayout {
  const base = gridLayout(nodeIds);
  const stored = readStored();
  const layout: DependencyLayout = {};
  for (const id of nodeIds) {
    const candidate = stored[id];
    layout[id] =
      candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
        ? { x: candidate.x, y: candidate.y }
        : base[id];
  }
  return layout;
}

export function saveLayout(layout: DependencyLayout): void {
  writeStored(layout);
}

/** Clear any saved overrides and return the deterministic grid for the given nodes. */
export function resetLayout(nodeIds: string[]): DependencyLayout {
  writeStored({});
  return loadLayout(nodeIds);
}
