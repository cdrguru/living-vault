type MeterTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const bars: Record<MeterTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-border-strong',
};

/**
 * A compact horizontal bar for a 0..1 ratio (success rate, maturity, share).
 * Pairs an at-a-glance fill with an optional monospaced readout so dense tables
 * surface outliers without forcing the eye to parse every number.
 */
export function Meter({
  value,
  tone = 'accent',
  showValue = false,
  label,
  className = '',
}: {
  value: number;
  tone?: MeterTone;
  showValue?: boolean;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(clamped * 100);
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={pct}
        className="h-1.5 w-full min-w-[3rem] overflow-hidden rounded-full bg-surface-inset"
        role={label ? 'progressbar' : undefined}
      >
        <div className={`h-full rounded-full ${bars[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{pct}%</span>
      )}
    </div>
  );
}
