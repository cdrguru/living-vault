import type { AssetSignal } from "@/data";

/**
 * The visual states an AssetStateBadge can show. Each is a distinct glyph shape
 * plus a token tone plus a text label, so meaning never rides on color alone
 * (WCAG 1.4.1). The quadrant states map one to one with scoreAsset's quadrant.
 */
export type AssetState =
  | "Stars"
  | "Risks"
  | "Shelfware"
  | "Dead weight"
  | "stale"
  | "duplicate"
  | "orphan"
  | "fragile";

type Tone = "accent" | "danger" | "warning" | "border-strong" | "info";

interface StateStyle {
  label: string;
  tone: Tone;
  /** Hand-authored small SVG path. aria-hidden, since the text is the accessible name. */
  glyph: React.ReactNode;
}

/** A filled five-point star: the Stars quadrant, our best outcome. */
const starGlyph = (
  <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3 4.2 13.3l.7-4.3-3.1-3 4.3-.6z" />
);

/** A warning triangle with a bang: Shelfware and stale, a soft caution. */
const triangleGlyph = (
  <>
    <path d="M8 2l6 11H2z" />
    <rect
      fill="var(--surface)"
      height="3.4"
      rx="0.5"
      width="1.3"
      x="7.35"
      y="6.4"
    />
    <rect
      fill="var(--surface)"
      height="1.3"
      rx="0.5"
      width="1.3"
      x="7.35"
      y="10.3"
    />
  </>
);

/** A stop octagon: Risks, the loudest danger. */
const octagonGlyph = <path d="M5 1.5h6L14.5 5v6L11 14.5H5L1.5 11V5z" />;

/** A hollow square: Dead weight, neutral and inert. */
const squareGlyph = (
  <rect
    fill="none"
    height="11"
    rx="1.5"
    stroke="currentColor"
    strokeWidth="1.6"
    width="11"
    x="2.5"
    y="2.5"
  />
);

/** Two overlapping squares: a duplicate content hash. */
const duplicateGlyph = (
  <>
    <rect
      fill="none"
      height="8"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
      width="8"
      x="2"
      y="2"
    />
    <rect height="8" rx="1" width="8" x="6" y="6" />
  </>
);

/** A person outline with a slash: an orphan, no owner. */
const orphanGlyph = (
  <>
    <circle cx="8" cy="5" r="2.4" />
    <path d="M3.2 13c0-2.7 2.2-4.3 4.8-4.3s4.8 1.6 4.8 4.3z" />
    <path d="M2 2l12 12" stroke="var(--surface)" strokeWidth="1.6" />
  </>
);

/** A broken link: a fragile dependency on a deprecated or retired asset. */
const fragileGlyph = (
  <path
    d="M5.5 8a2.5 2.5 0 010-3.5L7 3M10.5 8a2.5 2.5 0 010 3.5L9 13M6 6.5L4.5 5M11.5 11L10 9.5"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.6"
  />
);

const STATE_STYLE: Record<AssetState, StateStyle> = {
  Stars: { label: "Stars", tone: "accent", glyph: starGlyph },
  Risks: { label: "Risks", tone: "danger", glyph: octagonGlyph },
  Shelfware: { label: "Shelfware", tone: "warning", glyph: triangleGlyph },
  "Dead weight": {
    label: "Dead weight",
    tone: "border-strong",
    glyph: squareGlyph,
  },
  stale: { label: "Stale", tone: "warning", glyph: triangleGlyph },
  duplicate: { label: "Duplicate", tone: "info", glyph: duplicateGlyph },
  orphan: { label: "No owner", tone: "warning", glyph: orphanGlyph },
  fragile: { label: "Fragile deps", tone: "danger", glyph: fragileGlyph },
};

/**
 * Static Tailwind classes per tone so the JIT scanner sees them. Each tone is a
 * surface, a foreground, and a ring, the same token vocabulary as Pill.
 */
const TONE_CLASS: Record<Tone, string> = {
  accent: "bg-accent/15 text-accent-strong ring-accent/30",
  danger: "bg-danger-surface text-danger-fg ring-danger/30",
  warning: "bg-warning-surface text-warning-fg ring-warning/30",
  "border-strong": "bg-surface-inset text-muted ring-border-strong",
  info: "bg-info-surface text-info-fg ring-info/30",
};

/** A single state chip: glyph plus label, color plus shape plus icon. */
export function AssetStateBadge({
  state,
  className = "",
  title,
}: {
  state: AssetState;
  className?: string;
  title?: string;
}) {
  const style = STATE_STYLE[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASS[style.tone]} ${className}`.trim()}
      title={title}
    >
      <svg
        aria-hidden="true"
        className="h-3 w-3 shrink-0"
        fill="currentColor"
        height="12"
        viewBox="0 0 16 16"
        width="12"
      >
        {style.glyph}
      </svg>
      <span>{style.label}</span>
    </span>
  );
}

/**
 * The quadrant plus the derived flags an AssetSignal raises, as one row of badges.
 * The quadrant always shows; stale, duplicate, orphan, and fragile add only when
 * present so the same primitive reads identically on every surface.
 */
export function AssetStateBadges({
  signal,
  className = "",
}: {
  signal: AssetSignal;
  className?: string;
}) {
  const states: AssetState[] = [signal.quadrant];
  if (signal.fragileDeps) states.push("fragile");
  if (signal.duplicate) states.push("duplicate");
  if (signal.orphan) states.push("orphan");
  if (signal.stale) states.push("stale");
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 ${className}`.trim()}
    >
      {states.map((state) => (
        <AssetStateBadge key={state} state={state} />
      ))}
    </span>
  );
}
