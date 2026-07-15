import { LENSES, LENS_BY_ID, type LensId } from "./lenses";
import { ToneGlyph } from "./ToneGlyph";

/**
 * The lens toolbar re-skins the one shared asset map. Each lens is a real radio
 * button with aria-checked so the active encoding is announced, and the legend
 * below names the active lens encoding so meaning is never tooltip-only.
 */
export function LensToolbar({
  active,
  onChange,
}: {
  active: LensId;
  onChange: (lens: LensId) => void;
}) {
  const lens = LENS_BY_ID[active];
  return (
    <div className="space-y-2">
      <div
        aria-label="Map lens"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-1"
        role="radiogroup"
      >
        {LENSES.map((item) => {
          const selected = item.id === active;
          return (
            <button
              aria-checked={selected}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                selected
                  ? "bg-accent/15 text-accent-strong ring-1 ring-accent"
                  : "text-muted hover:bg-surface-inset hover:text-fg"
              }`}
              key={item.id}
              onClick={() => onChange(item.id)}
              role="radio"
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-medium text-subtle">{lens.description}</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lens.legend.map((entry) => (
            <li
              className="inline-flex items-center gap-1.5"
              key={`${entry.tone}-${entry.label}`}
            >
              <ToneGlyph
                className={
                  entry.tone === "success"
                    ? "text-success"
                    : entry.tone === "danger"
                      ? "text-danger"
                      : entry.tone === "warn"
                        ? "text-warning"
                        : "text-muted"
                }
                glyph={entry.glyph}
              />
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
