import type { ModelUsage } from "@/data";
import { formatNumber, formatPercent } from "@/dashboard/format";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { Meter } from "@/dashboard/components/Meter";

/**
 * The by-model effectiveness breakdown: how the fleet's invocations split across
 * models, with the success rate of each. The model is a measured dimension off each
 * utilization row, so this is real usage, not an estimate. Share is invocation share
 * within the active window. Models with no invocations are omitted.
 */
export function EffectivenessByModel({ usage }: { usage: ModelUsage[] }) {
  const measured = usage.filter((row) => row.invocations > 0);
  if (measured.length === 0) {
    return (
      <EmptyState>
        No model-attributed telemetry in this window yet. The split appears once
        usage is recorded with a model.
      </EmptyState>
    );
  }
  const total = measured.reduce((sum, row) => sum + row.invocations, 0);
  return (
    <ul className="space-y-2.5">
      {measured.map((row) => {
        const share = total ? row.invocations / total : 0;
        return (
          <li
            className="rounded-lg border border-border bg-surface-inset p-3"
            key={row.model}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-sm font-semibold text-fg">
                {row.model}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {formatPercent(share)} of runs
              </span>
            </div>
            <Meter className="mt-2.5" tone="accent" value={share} />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <span>
                <span className="font-mono tabular-nums text-fg">
                  {formatNumber(row.invocations)}
                </span>{" "}
                invocations
              </span>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
              <span>
                <span className="font-mono tabular-nums text-fg">
                  {formatPercent(row.successRate)}
                </span>{" "}
                success
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
