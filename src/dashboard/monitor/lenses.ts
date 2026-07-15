import type { UsageSummary } from "@/data/metrics";

import type { MonitorNode, NodeTone } from "./monitorMeta";

/**
 * Lenses re-skin the one shared asset map without changing its nodes or edges.
 * Each lens is a pure function from a node (plus its windowed usage) to a visual
 * encoding, and names its own legend so the meaning is never tooltip-only. State
 * is carried by tone (color), an icon glyph (shape), and a label, never color
 * alone (WCAG 1.4.1).
 */

export type LensId =
  | "health"
  | "governance"
  | "usage"
  | "dependency"
  | "freshness";

export interface NodeEncoding {
  /** Token tone for the node fill and ring. */
  tone: NodeTone;
  /** Relative size multiplier in the range 0.7 to 1.6 so fan-in and volume read spatially. */
  scale: number;
  /** Opacity in the range 0.35 to 1 so freshness can dim stale nodes. */
  opacity: number;
  /** A short shape token so the encoding survives grayscale. */
  glyph: string;
  /** A one-line accessible description of this node under the active lens. */
  caption: string;
}

export interface LensLegendItem {
  tone: NodeTone;
  glyph: string;
  label: string;
}

export interface LensDef {
  id: LensId;
  label: string;
  /** A short sentence describing what the lens encodes. */
  description: string;
  legend: LensLegendItem[];
}

/** Bucket a 0..1 governed score into a good, warn, or risk tone. */
export function governanceTone(governedScore: number): NodeTone {
  if (governedScore >= 0.8) return "success";
  if (governedScore >= 0.5) return "warn";
  return "danger";
}

/** Clamp a value into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scale a windowed invocation count to a node size multiplier. Zero invocations
 * stays at the floor so a no-telemetry node is still visible, and the scale grows
 * with the log of the count so one heavy asset does not dwarf the rest.
 */
export function usageScale(invocations: number): number {
  if (invocations <= 0) return 0.8;
  return clamp(0.8 + Math.log10(invocations + 1) * 0.28, 0.8, 1.6);
}

/** Scale a required-by fan-in to a node size multiplier. A leaf stays small, a hub grows. */
export function fanInScale(requiredByCount: number): number {
  return clamp(0.8 + requiredByCount * 0.18, 0.8, 1.6);
}

const GLYPH: Record<NodeTone, string> = {
  success: "star",
  danger: "alert",
  warn: "flag",
  muted: "dot",
};

/**
 * The visual encoding for one node under the chosen lens, given that node's
 * windowed usage. usage may be undefined when an asset has no telemetry in the
 * window, which Usage and Freshness both treat as a measured low, not an error.
 */
export function encodeNode(
  lens: LensId,
  node: MonitorNode,
  usage: UsageSummary | undefined,
): NodeEncoding {
  const invocations = usage?.invocations ?? 0;
  switch (lens) {
    case "governance": {
      const tone = governanceTone(node.score.governedScore);
      return {
        tone,
        scale: 1,
        opacity: 1,
        glyph: GLYPH[tone],
        caption: `Governed score ${Math.round(node.score.governedScore * 100)} percent`,
      };
    }
    case "usage": {
      return {
        tone: node.tone,
        scale: usageScale(invocations),
        opacity: 1,
        glyph: GLYPH[node.tone],
        caption: `${invocations} invocations in the window`,
      };
    }
    case "dependency": {
      return {
        tone: node.tone,
        scale: fanInScale(node.requiredByCount),
        opacity: 1,
        glyph: GLYPH[node.tone],
        caption: `Required by ${node.requiredByCount} assets`,
      };
    }
    case "freshness": {
      return {
        tone: node.score.stale ? "warn" : node.tone,
        scale: 1,
        opacity: node.score.stale ? 0.5 : 1,
        glyph: node.score.stale ? "flag" : GLYPH[node.tone],
        caption: node.score.stale
          ? "Stale, not updated in over 180 days"
          : "Fresh",
      };
    }
    case "health":
    default:
      return {
        tone: node.tone,
        scale: 1,
        opacity: 1,
        glyph: GLYPH[node.tone],
        caption: `${node.quadrant}`,
      };
  }
}

/** The lens definitions and their per-lens legends, in toolbar order. */
export const LENSES: LensDef[] = [
  {
    id: "health",
    label: "Health",
    description: "Color each asset by its governed and effective quadrant.",
    legend: [
      {
        tone: "success",
        glyph: "star",
        label: "Stars, governed and effective",
      },
      {
        tone: "danger",
        glyph: "alert",
        label: "Risks, effective but ungoverned",
      },
      {
        tone: "warn",
        glyph: "flag",
        label: "Shelfware, governed but not effective",
      },
      { tone: "muted", glyph: "dot", label: "Dead weight, neither" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    description: "Bucket the governed score into good, warn, and risk.",
    legend: [
      { tone: "success", glyph: "star", label: "Good, 0.8 or higher" },
      { tone: "warn", glyph: "flag", label: "Warn, 0.5 to 0.8" },
      { tone: "danger", glyph: "alert", label: "Risk, below 0.5" },
    ],
  },
  {
    id: "usage",
    label: "Usage",
    description: "Size each node by its windowed invocation count.",
    legend: [
      { tone: "muted", glyph: "dot", label: "Smaller node, fewer invocations" },
      {
        tone: "success",
        glyph: "star",
        label: "Larger node, more invocations",
      },
    ],
  },
  {
    id: "dependency",
    label: "Dependency",
    description: "Size each node by its inbound required-by fan-in.",
    legend: [
      { tone: "muted", glyph: "dot", label: "Leaf, required by few" },
      { tone: "success", glyph: "star", label: "Hub, required by many" },
    ],
  },
  {
    id: "freshness",
    label: "Freshness",
    description: "Dim and flag any asset not updated in over 180 days.",
    legend: [
      { tone: "muted", glyph: "dot", label: "Fresh" },
      { tone: "warn", glyph: "flag", label: "Stale, dimmed" },
    ],
  },
];

export const LENS_BY_ID: Record<LensId, LensDef> = Object.fromEntries(
  LENSES.map((lens) => [lens.id, lens]),
) as Record<LensId, LensDef>;
