import { PRESET_LABEL, type TimeRangePreset } from "@/dashboard/timeRange";
import { useVault } from "@/dashboard/VaultContext";

const PRESETS: TimeRangePreset[] = ["7d", "30d", "90d", "all"];

function segmentClass(selected: boolean): string {
  return `rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
    selected
      ? "bg-accent/15 text-accent-strong ring-1 ring-accent"
      : "text-muted hover:bg-surface-inset hover:text-fg"
  }`;
}

/**
 * The global dashboard time range. Rolling presets (7d / 30d / 90d) anchor to the
 * latest date in the telemetry snapshot, All is full history, and Custom reveals
 * an absolute start and end clamped to the data bounds. It scopes every
 * telemetry-driven view through the Vault context. Hidden until telemetry exists,
 * since there is nothing to window on seed data.
 */
export function TimeRangeControl() {
  const {
    timeRange,
    timeRangePreset,
    timeRangeBounds,
    setTimeRangePreset,
    setCustomTimeRange,
  } = useVault();

  if (!timeRangeBounds) return null;

  const min = timeRangeBounds.start;
  const max = timeRangeBounds.end;
  const customActive = timeRangePreset === "custom";
  const start = (customActive && timeRange?.start) || min;
  const end = (customActive && timeRange?.end) || max;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div
        aria-label="Time range"
        className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-1"
        role="radiogroup"
      >
        {PRESETS.map((preset) => (
          <button
            aria-checked={timeRangePreset === preset}
            className={segmentClass(timeRangePreset === preset)}
            key={preset}
            onClick={() => setTimeRangePreset(preset)}
            role="radio"
            type="button"
          >
            {PRESET_LABEL[preset]}
          </button>
        ))}
        <button
          aria-checked={customActive}
          className={segmentClass(customActive)}
          onClick={() => setCustomTimeRange(timeRangeBounds)}
          role="radio"
          type="button"
        >
          {PRESET_LABEL.custom}
        </button>
      </div>
      {customActive && (
        <div className="inline-flex items-center gap-1 text-xs text-muted">
          <input
            aria-label="Start date"
            className="field h-8 w-[8.5rem] px-2 py-1 text-xs"
            max={end}
            min={min}
            onChange={(event) =>
              setCustomTimeRange({ start: event.target.value, end })
            }
            type="date"
            value={start}
          />
          <span aria-hidden="true">to</span>
          <input
            aria-label="End date"
            className="field h-8 w-[8.5rem] px-2 py-1 text-xs"
            max={max}
            min={start}
            onChange={(event) =>
              setCustomTimeRange({ start, end: event.target.value })
            }
            type="date"
            value={end}
          />
        </div>
      )}
    </div>
  );
}
