/**
 * Accent theme axis. Light vs dark stays the existing .dark class on <html>
 * (see ThemeToggle and preferences.ts); the accent palette is an orthogonal
 * data-accent attribute on <html>. The default accent (orange) carries NO
 * attribute, so :root / .dark in main.css remain the zero-risk baseline and
 * every other palette is a purely additive override block.
 *
 * Each palette only remaps the --accent family plus --accent-rgb and the
 * --chart-accent tokens, so charts (via useChartTheme), the glow, the selection
 * highlight, buttons, and focus rings all follow with no per-component edits.
 */
export const ACCENT_KEY = "living-vault:accent";

export interface AccentDef {
  /** data-accent value; "orange" is the attribute-free default. */
  id: string;
  label: string;
  /** Representative swatch hex for the picker chip (the light-mode accent). */
  swatch: string;
}

export const ACCENTS: AccentDef[] = [
  { id: "orange", label: "Orange", swatch: "#f97316" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "contrast", label: "High contrast", swatch: "#1d4ed8" },
];

export const DEFAULT_ACCENT = "orange";

export function isAccent(value: string | null): value is string {
  return !!value && ACCENTS.some((accent) => accent.id === value);
}

/** The persisted accent, falling back to the default when unset or corrupt. */
export function readAccent(): string {
  try {
    const stored = globalThis.localStorage?.getItem(ACCENT_KEY) ?? null;
    if (isAccent(stored)) return stored;
  } catch {
    /* storage unavailable; fall through to the default */
  }
  return DEFAULT_ACCENT;
}

/** Apply an accent everywhere: set or clear the data-accent attribute, persist. */
export function applyAccent(accent: string): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", accent);
  }
  try {
    globalThis.localStorage?.setItem(ACCENT_KEY, accent);
  } catch {
    /* storage unavailable; the in-memory change still applies for this session */
  }
}
