import { formatPercent } from "@/dashboard/format";
import { CountUp } from "@/dashboard/components/CountUp";
import { Sparkline } from "@/dashboard/components/Sparkline";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { TOOLTIPS, type TooltipKey } from "@/dashboard/tooltips";

type Tone = "neutral" | "good" | "warn" | "risk";

export function KpiCard({
  label,
  info,
  value,
  detail,
  tone = "neutral",
  className,
  delta,
  deltaLabel,
  goodDirection = "up",
  trend,
  trendLabel,
  countTo,
  countFormat,
}: {
  label: string;
  info?: TooltipKey;
  value: string;
  detail?: string;
  tone?: Tone;
  /** Optional extra classes scoped to one card instance (page-level accents). */
  className?: string;
  /** Signed fractional change vs the prior period; null/undefined hides the chip. */
  delta?: number | null;
  deltaLabel?: string;
  /** Which direction is favorable, so a rising cost reads red and rising usage reads green. */
  goodDirection?: "up" | "down";
  /** Daily series for the inline sparkline; omitted hides it. */
  trend?: number[];
  trendLabel?: string;
  /**
   * Optional real, tracked number to count up to on mount. When set with
   * countFormat the headline tweens from zero using that formatter instead of
   * showing the static `value` string. Never wire an untracked metric (cost,
   * tokens, refusals) to this; pass them as the plain `value` string instead.
   */
  countTo?: number;
  countFormat?: (value: number) => string;
}) {
  const tones: Record<Tone, string> = {
    neutral: "border-border bg-surface text-fg",
    good: "border-success/30 bg-success-surface text-success-fg",
    warn: "border-warning/30 bg-warning-surface text-warning-fg",
    risk: "border-danger/30 bg-danger-surface text-danger-fg",
  };

  const hasDelta = delta !== null && delta !== undefined;
  // A delta that rounds to 0% at the displayed precision is not real movement, so
  // it reads as a neutral em-dash with no arrow or color, rather than a misleading
  // green "0%" with an up arrow.
  const isFlat = !hasDelta || Math.round(Math.abs(delta!) * 100) === 0;
  const favorable =
    hasDelta && !isFlat && (goodDirection === "up" ? delta! > 0 : delta! < 0);
  const unfavorable =
    hasDelta && !isFlat && (goodDirection === "up" ? delta! < 0 : delta! > 0);
  const deltaTone = favorable
    ? "text-success"
    : unfavorable
      ? "text-danger"
      : "text-subtle";
  const arrow = isFlat ? "" : delta! > 0 ? "▲" : "▼";
  const direction = isFlat ? "flat" : delta! > 0 ? "up" : "down";

  return (
    <div
      className={`rounded-xl border p-3.5 shadow-card transition-colors ${tones[tone]}${className ? ` ${className}` : ""}`}
    >
      <div className="eyebrow flex items-center gap-1.5">
        <span>{label}</span>
        {info && <InfoTooltip label={TOOLTIPS[info]} triggerLabel={`About ${label}`} />}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="font-mono text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums">
          {countTo !== undefined && countFormat ? (
            <CountUp format={countFormat} value={countTo} />
          ) : (
            value
          )}
        </div>
        {trend && trend.length > 0 && (
          <Sparkline
            className={
              favorable
                ? "text-success"
                : unfavorable
                  ? "text-danger"
                  : "text-accent"
            }
            fill
            height={22}
            label={trendLabel ?? `${label} trend`}
            series={trend}
            width={72}
          />
        )}
      </div>
      {detail && <div className="mt-1 text-sm text-muted">{detail}</div>}
      {hasDelta && (
        <div
          className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${deltaTone}`}
        >
          {arrow && <span aria-hidden="true">{arrow}</span>}
          <span className="tabular-nums">
            {isFlat ? "-" : formatPercent(Math.abs(delta!))}
          </span>
          {deltaLabel && (
            <span className="font-normal text-subtle">{deltaLabel}</span>
          )}
          <span className="sr-only">{direction} versus the prior period</span>
        </div>
      )}
    </div>
  );
}
