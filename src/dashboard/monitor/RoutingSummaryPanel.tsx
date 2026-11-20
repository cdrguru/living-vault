import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { Pill } from "@/dashboard/components/Pill";
import { formatCompact, formatPercent } from "@/dashboard/format";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { useVault } from "@/dashboard/VaultContext";
import { routingTotals } from "@/data/routingMetrics";

const usd = (value: number): string =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Routing accounting at a glance: how often routed requests were answered
 * locally by a governed asset (the cache hit rate), what the external fallbacks
 * measurably cost, and what the local hits are modeled to have avoided. Renders
 * only from routingStats (imported by a router via
 * importRoutingStats); with no routing stats it says a router has not reported,
 * because "no router ran" must never read as a zero hit rate. Every figure is
 * scoped to routed traffic; the avoided-cost figure carries its modeled grade
 * as a pill so a counterfactual can never pass for measured spend.
 */
export function RoutingSummaryPanel() {
  const { dataset, timeRange } = useVault();
  const totals = dataset
    ? routingTotals(dataset, timeRange ?? undefined)
    : null;
  const tracked = dataset?.routingStatsMeta?.tracked ?? null;

  return (
    <section
      aria-label="Routing summary"
      className="rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-sm font-semibold tracking-tight text-fg">
            Routing at a glance
          </h2>
          <InfoTooltip
            label={TOOLTIPS["monitor.routing"]}
            triggerLabel="About routing"
          />
          <span className="eyebrow text-subtle">routed traffic only</span>
        </div>
      </header>

      {!totals || totals.routedDecisions === 0 ? (
        <EmptyState>
          No routing decisions in the current snapshot. A router
          reports them via importRoutingStats.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <li className="min-w-0 rounded-lg border border-border bg-surface-inset p-3">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {totals.hitRate === null ? "-" : formatPercent(totals.hitRate)}
            </div>
            <div className="eyebrow text-subtle">cache hit rate</div>
          </li>
          <li className="min-w-0 rounded-lg border border-border bg-surface-inset p-3">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {formatCompact(totals.localHits)} / {formatCompact(totals.routedDecisions)}
            </div>
            <div className="eyebrow text-subtle">local hits / routed</div>
          </li>
          <li className="min-w-0 rounded-lg border border-border bg-surface-inset p-3">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {usd(totals.externalCost)}
            </div>
            <div className="eyebrow text-subtle">external routing cost</div>
            {tracked && tracked.externalCost !== "full" && (
              <span className="mt-1 inline-flex">
                <Pill severity="warn" tone="amber">
                  {tracked.externalCost}
                </Pill>
              </span>
            )}
          </li>
          <li className="min-w-0 rounded-lg border border-border bg-surface-inset p-3">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {usd(totals.avoidedCostEstimate)}
            </div>
            <div className="eyebrow text-subtle">avoided cost</div>
            <span className="mt-1 inline-flex">
              <Pill severity="warn" tone="amber">
                {tracked?.avoidedCostEstimate ?? "modeled"}
              </Pill>
            </span>
          </li>
        </ul>
      )}
    </section>
  );
}
