import { defaultFilters, type VaultFilters } from "@/dashboard/filters";
import type { TimeRangePreset } from "@/dashboard/timeRange";

/**
 * Typed, fault-tolerant access to the persisted user preferences. Every getter
 * falls back to a safe default when storage is unavailable or the stored value
 * is missing or corrupt, so a bad localStorage entry can never crash a render.
 * Keys reuse the existing living-vault namespace; theme and the initial sidebar
 * state share the keys their original header controls already write.
 */
export const PREF_KEYS = {
  theme: "living-vault:theme",
  defaultRange: "living-vault:default-range",
  defaultFilters: "living-vault:default-filters",
  sidebarCollapsed: "living-vault:sidebar-collapsed",
} as const;

export type ThemePref = "light" | "dark";

/** Fired after setTheme so other mounted theme controls can resync live. */
export const THEME_EVENT = "lv:pref-theme";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable; the in-memory change still applies for this session */
  }
}

export function getTheme(): ThemePref {
  if (read(PREF_KEYS.theme) === "light") return "light";
  if (read(PREF_KEYS.theme) === "dark") return "dark";
  // No stored choice: follow whatever the pre-paint script set on <html>.
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  return "light";
}

/** Apply a theme everywhere: flip the html class, persist, and notify listeners. */
export function setTheme(theme: ThemePref): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  write(PREF_KEYS.theme, theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  }
}

const RANGE_VALUES: readonly TimeRangePreset[] = [
  "7d",
  "30d",
  "90d",
  "all",
  "custom",
];

export function getDefaultRange(): TimeRangePreset {
  const stored = read(PREF_KEYS.defaultRange);
  // "custom" needs an absolute window we do not persist, so it is not a valid
  // default; fall back to 30d, the historical hardcoded default.
  return stored && stored !== "custom" && RANGE_VALUES.includes(stored as TimeRangePreset)
    ? (stored as TimeRangePreset)
    : "30d";
}

export function setDefaultRange(preset: TimeRangePreset): void {
  write(PREF_KEYS.defaultRange, preset);
}

/** The persisted catalogue filter defaults. Search is never stored; it always
 * starts empty so a saved query cannot silently hide assets on load. */
export function getDefaultFilters(): VaultFilters {
  const raw = read(PREF_KEYS.defaultFilters);
  if (!raw) return { ...defaultFilters };
  try {
    const parsed = JSON.parse(raw) as Partial<VaultFilters>;
    return {
      search: "",
      type: parsed.type ?? defaultFilters.type,
      tier: parsed.tier ?? defaultFilters.tier,
      status: parsed.status ?? defaultFilters.status,
      risk: parsed.risk ?? defaultFilters.risk,
    };
  } catch {
    return { ...defaultFilters };
  }
}

export function setDefaultFilters(filters: VaultFilters): void {
  const { type, tier, status, risk } = filters;
  write(PREF_KEYS.defaultFilters, JSON.stringify({ type, tier, status, risk }));
}

export function clearDefaultFilters(): void {
  try {
    globalThis.localStorage?.removeItem(PREF_KEYS.defaultFilters);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}

export function getSidebarStartsCollapsed(): boolean {
  return read(PREF_KEYS.sidebarCollapsed) === "1";
}

export function setSidebarStartsCollapsed(collapsed: boolean): void {
  write(PREF_KEYS.sidebarCollapsed, collapsed ? "1" : "0");
}
