import type { HarnessSpend } from '@/data';
import { formatCompact, formatCurrencyPrecise, formatNumber } from '@/dashboard/format';
import { EmptyState } from '@/dashboard/components/EmptyState';
import { Meter } from '@/dashboard/components/Meter';
import { Pill } from '@/dashboard/components/Pill';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TEXT_TONE: Record<Tone, string> = {
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  neutral: 'text-fg',
};

/**
 * Rank a priced harness by cost per success: the cheapest reads as good (green),
 * the most expensive as a risk (red), the rest as neutral so the eye lands on the
 * two extremes. With a single priced harness there is no spread, so it stays
 * neutral. Color is paired with the ranked order and the number, never alone.
 */
function toneFor(value: number, best: number, worst: number): Tone {
  if (best === worst) return 'neutral';
  if (value <= best) return 'success';
  if (value >= worst) return 'danger';
  return 'warning';
}

/**
 * The cost efficiency comparison across harnesses: estimated dollars per
 * successful outcome per model, ranked cheapest first. Spend is derived from each
 * harness's token usage at list prices, so the whole panel is an estimate, not
 * metered billing. Harnesses that log no tokens are shown unpriced rather than as
 * a misleading zero.
 */
/** Render harness labels as a comma-separated inline list for a footnote. */
function labelList(rows: HarnessSpend[]) {
  return rows.map((row, index) => (
    <span key={row.source}>
      {index > 0 ? ', ' : ''}
      <span className="text-muted">{row.label}</span>
    </span>
  ));
}

export function CostEfficiencyByModel({ spend }: { spend: HarnessSpend[] }) {
  const priced = spend.filter((row) => row.priced && row.costPerSuccess !== null);
  // Three honest footnote groups, kept distinct: a harness that logs no tokens
  // cannot be priced at all; one that logs tokens but recorded none in the window
  // is simply idle here; and a priced harness with no successes has a real spend
  // but an undefined cost per success.
  const tokenless = spend.filter((row) => !row.priced && !row.logsTokens);
  const idleInWindow = spend.filter((row) => !row.priced && row.logsTokens);
  const noSuccess = spend.filter((row) => row.priced && row.costPerSuccess === null);

  if (priced.length === 0) {
    return (
      <EmptyState>
        No harness logs tokens in this window, so spend cannot be estimated. Cost per model appears
        once a harness reports token usage.
      </EmptyState>
    );
  }

  const values = priced.map((row) => row.costPerSuccess as number);
  const best = Math.min(...values);
  const worst = Math.max(...values);

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {priced.map((row) => {
          const cps = row.costPerSuccess as number;
          const tone = toneFor(cps, best, worst);
          // Bar fills relative to the most expensive harness, so a short bar reads
          // as cheap per success and a full bar as the costliest.
          const fill = worst > 0 ? cps / worst : 0;
          return (
            <li
              className="rounded-lg border border-border bg-surface-inset p-3"
              key={row.source}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-display text-sm font-semibold text-fg">{row.label}</span>
                  {row.modelCount > 1 ? (
                    <span className="shrink-0 text-xs text-subtle">
                      {formatNumber(row.modelCount)} models
                    </span>
                  ) : (
                    row.model && (
                      <span className="truncate text-xs text-subtle" title={row.model}>
                        {row.model}
                      </span>
                    )
                  )}
                  {tone === 'success' && (
                    <Pill severity="good" tone="green">
                      most efficient
                    </Pill>
                  )}
                  {tone === 'danger' && (
                    <Pill severity="danger" tone="red">
                      least efficient
                    </Pill>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-lg font-semibold tabular-nums ${TEXT_TONE[tone]}`}>
                    {formatCurrencyPrecise(cps)}
                  </div>
                  <div className="eyebrow text-subtle">per success</div>
                </div>
              </div>
              <Meter
                className="mt-2.5"
                label={`${row.label}: ${formatCurrencyPrecise(cps)} per success, ${Math.round(
                  fill * 100,
                )}% of the costliest harness`}
                tone={tone}
                value={fill}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>
                  <span className="font-mono tabular-nums text-fg">
                    {formatCurrencyPrecise(row.cost)}
                  </span>{' '}
                  est. spend
                </span>
                <span aria-hidden="true" className="text-subtle">
                  ·
                </span>
                <span>
                  <span className="font-mono tabular-nums text-fg">
                    {formatNumber(row.successes)}
                  </span>{' '}
                  successes
                </span>
                <span aria-hidden="true" className="text-subtle">
                  ·
                </span>
                <span>
                  <span className="font-mono tabular-nums text-fg">
                    {formatCompact(row.tokens)}
                  </span>{' '}
                  tokens
                </span>
                {row.quality === 'partial' && (
                  <Pill severity="warn" tone="amber">
                    rough
                  </Pill>
                )}
                {row.quality === 'modeled' && (
                  <Pill severity="info" tone="blue">
                    modeled
                  </Pill>
                )}
              </div>
              {row.modelCount > 1 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
                  {row.byModel.map((m) => (
                    <li className="flex items-baseline gap-1.5" key={m.model}>
                      <span className="truncate text-muted" title={m.model}>
                        {m.model}
                      </span>
                      <span className="font-mono tabular-nums text-fg">
                        {formatCurrencyPrecise(m.cost)}
                      </span>
                      <span className="text-subtle">
                        ({formatCompact(m.tokens)})
                      </span>
                      {m.cacheReadTokens && m.cacheReadTokens > 0 ? (
                        <span className="text-subtle">
                          {Math.round(m.cacheReadTokens).toLocaleString()} cache-read tok @ ~10%
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {priced.length > 1 && (
        <p className="text-xs text-subtle">
          Bar length is cost per success relative to the costliest harness (
          {formatCurrencyPrecise(worst)} = full). Shorter is cheaper.
        </p>
      )}

      {idleInWindow.length > 0 && (
        <p className="text-xs text-subtle">
          No activity in this window: {labelList(idleInWindow)}. These log tokens but recorded none
          in the selected range; widen the range to price them.
        </p>
      )}

      {tokenless.length > 0 && (
        <p className="text-xs text-subtle">
          Not priced: {labelList(tokenless)}. These harnesses do not log token counts locally, so
          their spend cannot be estimated yet.
        </p>
      )}

      {noSuccess.length > 0 && (
        <p className="text-xs text-subtle">
          No successes in window: {labelList(noSuccess)}. These logged tokens but recorded no
          successful outcomes in this window, so cost per success is not defined.
        </p>
      )}
    </div>
  );
}
