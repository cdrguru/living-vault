import type { NodeTone } from "./monitorMeta";

/**
 * Token class fragments per node tone for a node fill, ring, and text. Kept in its
 * own module so the ToneGlyph component file only exports a component (the
 * fast-refresh discipline the dashboard already follows).
 */
export const TONE_CLASS: Record<
  NodeTone,
  { surface: string; ring: string; text: string }
> = {
  success: {
    surface: "bg-success-surface",
    ring: "ring-success/40",
    text: "text-success-fg",
  },
  danger: {
    surface: "bg-danger-surface",
    ring: "ring-danger/40",
    text: "text-danger-fg",
  },
  warn: {
    surface: "bg-warning-surface",
    ring: "ring-warning/40",
    text: "text-warning-fg",
  },
  muted: {
    surface: "bg-surface-inset",
    ring: "ring-border-strong",
    text: "text-muted",
  },
};
