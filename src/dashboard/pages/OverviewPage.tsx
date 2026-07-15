import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import {
  dailyTotals,
  effectiveAssetRate,
  evidenceCoverage,
  recommendedActions,
  regressingAssets,
  selectCostBasis,
  seriesDelta,
  staleAssets,
  type DailyTotal,
  type VaultDataset,
} from "@/data";
import { useVault } from "@/dashboard/VaultContext";
import { needsAttentionCount } from "@/dashboard/monitor/exceptionQueue";
import { useTriage } from "@/dashboard/monitor/triageStore";
import { costRangeLabel } from "@/dashboard/timeRange";
import {
  datasetHasOnlyProbe,
  readEnvInput,
  telemetryBanner,
} from "@/dashboard/settings/environment";
import {
  formatCurrencyPrecise,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/dashboard/format";
import { Button } from "@/dashboard/components/Button";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { Panel } from "@/dashboard/components/Panel";
import { Pill } from "@/dashboard/components/Pill";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { useTour } from "@/dashboard/tour";
import { QuadrantChart } from "@/dashboard/components/QuadrantChart";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";

/** Stagger surfaces on load through the data-rise animation in main.css. */
const rise = (ms: number): CSSProperties =>
  ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

/**
 * Success rate is a ratio of sums, so its period delta is computed from the
 * windowed totals rather than averaging the daily ratios. Returns null when the
 * prior window logged no invocations (no honest baseline).
 */
function successRateDelta(totals: DailyTotal[]): number | null {
  const half = Math.floor(totals.length / 2);
  if (half < 1) return null;
  const rate = (rows: DailyTotal[]) => {
    const invocations = rows.reduce((sum, row) => sum + row.invocations, 0);
    return invocations
      ? rows.reduce((sum, row) => sum + row.successes, 0) / invocations
      : 0;
  };
  const prior = rate(
    totals.slice(totals.length - 2 * half, totals.length - half),
  );
  if (prior === 0) return null;
  return (rate(totals.slice(totals.length - half)) - prior) / prior;
}

/** Severity drives both the Pill tone and the matching icon, so the row reads by color, shape, and text. */
type FixSeverity = "high" | "medium" | "low";

interface TopFix {
  assetId: string;
  name: string;
  severity: FixSeverity;
  /** Short phrase naming the problem in plain English. */
  reason: string;
}

const SEVERITY_PILL: Record<FixSeverity, "red" | "amber" | "slate"> = {
  high: "red",
  medium: "amber",
  low: "slate",
};

const SEVERITY_LABEL: Record<FixSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** A small glyph per severity so the list is not color-only (WCAG 1.4.1). */
const SEVERITY_ICON: Record<FixSeverity, string> = {
  high: "!",
  medium: "*",
  low: ".",
};

/**
 * The top five fixes, sourced from the shared recommendedActions engine in
 * metrics.ts so the Overview list and the Monitor exception queue read from one
 * source of truth. That engine ranks each asset's single most urgent gap
 * severity descending (risk, fragile deps, duplicate, shelfware, orphan, stale,
 * then the remaining governance gaps), so the slice here is the genuine top five.
 */
function deriveTopFixes(dataset: VaultDataset): TopFix[] {
  return recommendedActions(dataset)
    .slice(0, 5)
    .map((action) => ({
      assetId: action.assetId,
      name: action.asset.name,
      severity: action.severity,
      reason: action.label,
    }));
}

export function OverviewPage() {
  const { dataset, loading, timeRange, timeRangePreset, getHarnessUsage } =
    useVault();
  // The guided tour is offered here on the Overview, the landing surface, in
  // addition to the Settings launcher and the demo-mode auto-start.
  const { start: startTour } = useTour();
  // Live triage state, so the attention chip drops in lockstep with the Monitor
  // queue as the owner acknowledges/dismisses/snoozes rows.
  const triage = useTriage();
  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <SkeletonKpiRow />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }
  if (dataset.assets.length === 0) {
    return (
      <EmptyState fill title="The Vault is empty">
        No assets in the Vault yet. Add assets from the Catalogue to populate
        the overview.
      </EmptyState>
    );
  }

  const stock = dataset.assets.filter((asset) => asset.tier === "stock").length;
  const custom = dataset.assets.filter(
    (asset) => asset.tier === "custom",
  ).length;
  const forked = dataset.assets.filter(
    (asset) => asset.tier === "forked",
  ).length;

  const totals = dailyTotals(dataset, timeRange ?? undefined);
  const invocationSeries = totals.map((row) => row.invocations);
  const errorSeries = totals.map((row) => row.errors);
  const rateSeries = totals.map((row) =>
    row.invocations ? row.successes / row.invocations : 0,
  );
  const totalInvocations = invocationSeries.reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalSuccesses = totals.reduce((sum, row) => sum + row.successes, 0);
  const totalErrors = errorSeries.reduce((sum, value) => sum + value, 0);
  const overallRate = totalInvocations ? totalSuccesses / totalInvocations : 0;

  // Window-aligned so the Stars share and the windowed counts.Risks chip below
  // describe the same slice of data, not all-history vs windowed.
  const rate = effectiveAssetRate(dataset, timeRange ?? undefined);
  const coverage = evidenceCoverage(dataset, timeRange ?? undefined);
  // Assets whose effectiveness fell on trustworthy evidence in this window. A
  // sliding asset is flagged before it crosses the absolute bar into Shelfware.
  const regressing = regressingAssets(dataset, timeRange ?? undefined);
  // regressingAssets sorts steepest-drop first, so [0] is the worst slide.
  const worstRegressing =
    regressing.length > 0
      ? (dataset.assets.find((row) => row.id === regressing[0].assetId)?.name ??
        null)
      : null;
  const meta = dataset.telemetryMeta;

  // Single cost source of truth, shared with the Cost page so the two never
  // disagree: it resolves the same basis (utilization / harness-estimate / none)
  // for the same window. The populated currency tile shows only when utilization-
  // backed; otherwise both pages render the not-tracked / estimate state.
  const costBasis = selectCostBasis(
    dataset,
    getHarnessUsage(),
    timeRange ?? undefined,
  );
  const costLabel = costRangeLabel(timeRangePreset, timeRange);

  // One data-derived banner so the label can never contradict the data source
  // (no more "modeled seed data" while reading live Fabric). The same probe signal
  // drives the band dot, so a probe-only state is not shown as healthy green.
  const onlyProbe = datasetHasOnlyProbe(dataset);
  const banner = telemetryBanner(readEnvInput(), dataset, onlyProbe);

  // Staleness is judged against the snapshot window only, never the wall clock,
  // so the band cannot imply real-time freshness off a fixed epoch. The seed
  // window ends on a fixed date; we flag it stale when that end lags its own
  // generation stamp by more than a week.
  const snapshotStale = meta
    ? new Date(meta.generatedAt).getTime() -
        Date.UTC(
          Number(meta.windowEnd.slice(0, 4)),
          Number(meta.windowEnd.slice(5, 7)) - 1,
          Number(meta.windowEnd.slice(8, 10)),
        ) >
      8 * 86_400_000
    : false;

  const measuredSet = meta
    ? (["invocations", "successes", "errors", "latency"] as const).filter(
        (key) => meta.tracked[key],
      )
    : [];

  const topFixes = deriveTopFixes(dataset);

  // The Stars share is a neutral summary stat, so the band stays informational.
  // Alert color is reserved for genuine work: it rides on counts.Risks (assets
  // needing attention now), shown as a separate status chip, not the headline.
  // Actionable rows under the same gate the Monitor's default view applies, with
  // the live triage state, so this chip equals the queue the Monitor renders (it
  // drops as rows are triaged) instead of the old windowed Risks count that read 0.
  const needsAttention = needsAttentionCount(dataset, triage.state);

  return (
    <div className="space-y-4">
      {/* 1. Telemetry freshness band: what was measured, over what window, how fresh. */}
      <section data-rise style={rise(0)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-card">
          <span
            aria-hidden="true"
            className={`pulse-dot inline-block h-2 w-2 rounded-full ${!meta || snapshotStale || onlyProbe ? "bg-warning" : "bg-success"}`}
          />
          {meta ? (
            <>
              <span className="font-medium text-fg">
                {formatNumber(meta.sessions)} sessions
              </span>
              <span className="text-subtle">
                window {formatDate(meta.windowStart)} to{" "}
                {formatDate(meta.windowEnd)}
              </span>
              <span className="text-subtle">
                measured:{" "}
                {measuredSet.length ? measuredSet.join(", ") : "nothing yet"}
              </span>
              {snapshotStale && <Pill tone="amber">Snapshot may be stale</Pill>}
            </>
          ) : (
            <span className="text-subtle">{banner.text}</span>
          )}
        </div>
      </section>

      {/* 2. One-line summary: Stars share as a neutral stat, attention as a status chip. */}
      <section data-rise style={rise(60)}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
          <p className="text-sm font-medium text-fg">
            {formatPercent(rate)} of scored assets are Stars (governed and
            effective).
          </p>
          <span className="text-xs text-subtle">
            {coverage.scored} of {coverage.total} assets scored
          </span>
          {needsAttention === 0 ? (
            <Pill severity="good" tone="green">
              0 need attention now
            </Pill>
          ) : (
            <Pill severity="danger" tone="red">
              {needsAttention} need attention now
            </Pill>
          )}
          {regressing.length > 0 && (
            <span className="flex items-center gap-2">
              <Pill tone="amber">{regressing.length} regressing</Pill>
              {worstRegressing && (
                <span className="text-xs text-subtle">
                  worst: {worstRegressing}
                </span>
              )}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {meta && (
              <span className="text-xs text-subtle">
                as of {formatDate(meta.windowEnd)}
              </span>
            )}
            <Button onClick={startTour} size="sm" variant="ghost">
              Take the tour
            </Button>
          </span>
        </div>
      </section>

      {/* 3. Live activity panel kept verbatim: real invocations, success rate, errors. */}
      {totals.length > 0 && (
        <div data-rise style={rise(120)}>
          <Panel
            action={
              <span className="text-xs text-subtle">
                {totals.length}-day window
              </span>
            }
            info="overview.liveActivity"
            title="Live activity"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KpiCard
                countFormat={formatNumber}
                countTo={totalInvocations}
                delta={seriesDelta(invocationSeries)}
                deltaLabel="vs prior"
                goodDirection="up"
                info="overview.invocations"
                label="Invocations"
                trend={invocationSeries}
                trendLabel="invocations per day"
                value={formatNumber(totalInvocations)}
              />
              <KpiCard
                delta={successRateDelta(totals)}
                deltaLabel="vs prior"
                goodDirection="up"
                info="overview.successRate"
                label="Success rate"
                trend={rateSeries}
                trendLabel="success rate per day"
                value={formatPercent(overallRate)}
              />
              <KpiCard
                countFormat={formatNumber}
                countTo={totalErrors}
                delta={seriesDelta(errorSeries)}
                deltaLabel="vs prior"
                goodDirection="down"
                info="overview.errors"
                label="Errors"
                trend={errorSeries}
                trendLabel="errors per day"
                value={formatNumber(totalErrors)}
              />
            </div>
          </Panel>
        </div>
      )}

      {/* 4. Top five What to fix next, each a severity Pill, a reason, and a link to detail. */}
      <div data-rise style={rise(180)}>
        <Panel
          action={
            <span className="text-xs text-subtle">top {topFixes.length}</span>
          }
          title="What to fix next"
        >
          {topFixes.length ? (
            <ul className="divide-y divide-border">
              {topFixes.map((fix) => (
                <li key={fix.assetId}>
                  <Link
                    className="flex items-start gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-surface-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                    to={`/asset/${fix.assetId}`}
                  >
                    <Pill tone={SEVERITY_PILL[fix.severity]}>
                      <span aria-hidden="true" className="mr-1 font-mono">
                        {SEVERITY_ICON[fix.severity]}
                      </span>
                      {SEVERITY_LABEL[fix.severity]}
                    </Pill>
                    {/* Name and reason share a column so the reason wraps on its own
                        line on mobile instead of crushing against the arrow, and sits
                        inline after the name once there is room. */}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-fg">{fix.name}</span>
                      <span className="mt-0.5 block text-sm text-muted sm:ml-2 sm:mt-0 sm:inline">
                        {fix.reason}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-subtle"
                    >
                      &rarr;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              Nothing flagged for action. Every asset is governed and effective.
            </EmptyState>
          )}
        </Panel>
      </div>

      {/* 5. Quadrant chart and library composition, demoted below the fold. */}
      <section
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
        data-rise
        style={rise(240)}
      >
        <Panel info="overview.quadrant" title="Governed x Effective quadrant">
          <QuadrantChart dataset={dataset} window={timeRange ?? undefined} />
        </Panel>
        <Panel info="overview.libraryComposition" title="Library composition">
          <div className="space-y-4">
            <KpiCard
              countFormat={formatNumber}
              countTo={dataset.assets.length}
              detail={`${stock} stock, ${custom} custom, ${forked} forked`}
              info="overview.totalAssets"
              label="Total assets"
              value={formatNumber(dataset.assets.length)}
            />
            {costBasis.basis === "utilization" ? (
              <KpiCard
                info="overview.cost30d"
                label={costLabel}
                value={formatCurrencyPrecise(costBasis.totalCost)}
              />
            ) : (
              <div className="rounded-xl border border-info/30 bg-info-surface p-3.5 text-info-fg shadow-card">
                <div className="eyebrow flex items-center gap-1.5">
                  <span>{costLabel}</span>
                  <InfoTooltip
                    label={TOOLTIPS["overview.cost30d"]}
                    triggerLabel={`About ${costLabel.toLowerCase()}`}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Pill tone="blue">Not tracked here</Pill>
                </div>
                <p className="mt-1 text-sm">
                  Per-asset cost is not tracked for this window. The Cost page
                  shows an estimate from harness token spend.
                </p>
              </div>
            )}
            <KpiCard
              countFormat={formatNumber}
              countTo={staleAssets(dataset).length}
              info="overview.staleAssets"
              label="Stale assets"
              tone="warn"
              value={formatNumber(staleAssets(dataset).length)}
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}
