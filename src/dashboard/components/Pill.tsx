export type PillTone = "slate" | "green" | "amber" | "red" | "blue";

/**
 * Severity maps a tone to a glyph shape so a Pill can carry meaning as color plus
 * shape (WCAG 1.4.1): a filled circle reads good, a triangle reads warn, an octagon
 * reads danger, a dot reads neutral, and an info-i reads informational.
 */
export type PillSeverity = "good" | "warn" | "danger" | "neutral" | "info";

/** Filled circle: good. */
const goodGlyph = <circle cx="8" cy="8" r="5" />;
/** Triangle: warn. */
const warnGlyph = <path d="M8 2.5l6 11H2z" />;
/** Octagon: danger. */
const dangerGlyph = <path d="M5.2 2h5.6L14 5.2v5.6L10.8 14H5.2L2 10.8V5.2z" />;
/** Small dot: neutral. */
const neutralGlyph = <circle cx="8" cy="8" r="2.6" />;
/** An info i: informational. */
const infoGlyph = (
  <>
    <circle cx="8" cy="4.4" r="1.2" />
    <rect height="6" rx="0.6" width="2" x="7" y="6.8" />
  </>
);

const SEVERITY_GLYPH: Record<PillSeverity, React.ReactNode> = {
  good: goodGlyph,
  warn: warnGlyph,
  danger: dangerGlyph,
  neutral: neutralGlyph,
  info: infoGlyph,
};

export function Pill({
  children,
  tone = "slate",
  severity,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  severity?: PillSeverity;
}) {
  const tones: Record<PillTone, string> = {
    slate: "bg-surface-inset text-muted ring-border",
    green: "bg-success-surface text-success-fg ring-success/30",
    amber: "bg-warning-surface text-warning-fg ring-warning/30",
    red: "bg-danger-surface text-danger-fg ring-danger/30",
    blue: "bg-info-surface text-info-fg ring-info/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {severity && (
        <svg
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0"
          fill="currentColor"
          height="10"
          viewBox="0 0 16 16"
          width="10"
        >
          {SEVERITY_GLYPH[severity]}
        </svg>
      )}
      {children}
    </span>
  );
}
