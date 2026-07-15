import type { VaultDataset } from "@/data";
import { utilizationDates, type DateWindow } from "@/data/metrics";
import { formatDate } from "@/dashboard/format";

/**
 * The global dashboard time range. Rolling presets are anchored to the latest
 * date in the telemetry snapshot (not the wall clock), since the data is a fixed
 * snapshot; "all" is full history; "custom" is an explicit absolute range.
 */
export type TimeRangePreset = "7d" | "30d" | "90d" | "all" | "custom";

export const PRESET_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const PRESET_LABEL: Record<TimeRangePreset, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
  custom: "Custom",
};

/**
 * A cost-card label that names the active time range, so the cost figure is read
 * in the right window: full history for "all", an absolute span for "custom",
 * and the rolling day count for the presets.
 */
export function costRangeLabel(
  preset: TimeRangePreset,
  window: DateWindow | null,
): string {
  if (preset === "all") return "Cost (all time)";
  if (preset === "custom" && window) {
    return `Cost (${formatDate(window.start)} to ${formatDate(window.end)})`;
  }
  return `Cost (last ${PRESET_DAYS[preset]}d)`;
}

/** Shift an ISO YYYY-MM-DD date by a number of days (UTC, snapshot-stable). */
export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve the active window from the preset plus the data's own date bounds.
 * Rolling presets count back from the latest data date (the snapshot anchor).
 * Returns null for "all" (full history) and for empty data.
 */
export function resolveTimeRange(
  bounds: DateWindow | null,
  preset: TimeRangePreset,
  custom: DateWindow | null,
): DateWindow | null {
  if (preset === "all") return null;
  if (preset === "custom") return custom;
  if (!bounds) return null;
  const end = bounds.end;
  const start = shiftDays(end, -(PRESET_DAYS[preset] - 1));
  return { start, end };
}

/** The smallest window covering both bounds (or whichever one is non-null). */
export function unionBounds(
  a: DateWindow | null,
  b: DateWindow | null,
): DateWindow | null {
  if (!a) return b;
  if (!b) return a;
  return {
    start: a.start < b.start ? a.start : b.start,
    end: a.end > b.end ? a.end : b.end,
  };
}

/** The dataset's telemetry date bounds, for clamping a custom range picker. */
export function dataBounds(dataset: VaultDataset | null): DateWindow | null {
  if (!dataset) return null;
  const dates = utilizationDates(dataset);
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}
