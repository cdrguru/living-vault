import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  allocateSpendByInvocations,
  codexBillingSnapshot,
  compareCodexBilling,
  costByType,
  harnessSpend,
  harnessSpendTotals,
  pricing,
  scoreAssets,
  selectCostBasis,
  wastedSpendAssets,
} from "@/data";
import type { AssetRow, Quadrant, WastedSpendRow } from "@/data";
import { useVault } from "@/dashboard/VaultContext";
import type { ColumnFilterDef } from "@/dashboard/components/columnFilters";
import { useColumnFilters } from "@/dashboard/components/useColumnFilters";
import { defaultFilters } from "@/dashboard/filters";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/dashboard/format";
import { SimpleBarChart } from "@/dashboard/components/Charts";
import { CostEfficiencyByModel } from "@/dashboard/components/CostEfficiencyByModel";
import { DataTable } from "@/dashboard/components/DataTable";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { Meter } from "@/dashboard/components/Meter";
import { Panel } from "@/dashboard/components/Panel";
import {
  Pill,
  type PillSeverity,
  type PillTone,
} from "@/dashboard/components/Pill";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";

const rise = (ms: number): CSSProperties =>
  ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

// Per-column header filters for the wasted-spend table. Asset/Type/Quadrant read
// off the row, so the defs are static.
const COST_COLUMNS: ColumnFilterDef<WastedSpendRow>[] = [
  {
    key: "asset",
    label: "Asset",
    type: "text",
    value: (row) => row.asset.name,
  },
  {
    key: "type",
    label: "Type",
    type: "select",
    value: (row) => row.asset.type,
    order: [
      "skill",
      "subagent",
      "prompt",
      "mcp-server",
      "hook",
      "command",
      "workflow",
    ],
  },
  {
    key: "quadrant",
    label: "Quadrant",
    type: "select",
    value: (row) => row.quadrant,
    order: ["Stars", "Risks", "Shelfware", "Dead weight"],
  },
];

/** Map a non-effective quadrant to a Pill that reads as color plus shape plus glyph. */
const quadrantPill = (
  quadrant: Quadrant,
): { tone: PillTone; severity: PillSeverity } =>
  quadrant === "Dead weight"
    ? { tone: "red", severity: "danger" }
    : { tone: "amber", severity: "warn" };

export function CostPage() {
  const { dataset, loading, getHarnessUsage, timeRange, setFilters } =
    useVault();
  const navigate = useNavigate();
  const columnFilters = useColumnFilters(COST_COLUMNS);
  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // The headline cost story: estimated spend per harness from token usage at model
  // list prices, ranked by cost per successful outcome. getHarnessUsage is already
  // windowed by the global time range, so this section honors it for free.
  const modelSpend = harnessSpend(getHarnessUsage());
  const modelTotals = harnessSpendTotals(modelSpend);
  const meta = dataset.telemetryMeta;
  // Single cost source of truth, shared with the Overview cost tile so the two
  // headline numbers agree for the same window: utilization-backed when per-asset
  // cost is tracked, otherwise the harness list-price estimate, otherwise none.
  const costBasis = selectCostBasis(
    dataset,
    getHarnessUsage(),
    timeRange ?? undefined,
  );
  const codexBilling = compareCodexBilling(
    getHarnessUsage(),
    codexBillingSnapshot,
  );

  // The secondary, asset-level view answers which assets waste spend. Its per-asset
  // cost has two possible bases. Seed data carries modeled per-asset cost. Live
  // telemetry does not, so it falls back to allocating the real harness token spend
  // (the same estimate behind the headline) across assets by invocation share. Only
  // the harness whose source matches the telemetry is the pool, since Codex and Grok
  // spend is not attributed to catalogue assets. Either basis is labeled, never billed.
  const scored = scoreAssets(dataset, timeRange ?? undefined);
  const modeledSpend = scored.reduce((sum, score) => sum + score.usage.cost, 0);
  const harnessForAssets = meta
    ? modelSpend.find((row) => row.source === meta.source && row.priced)
    : undefined;
  const allocatedPool = harnessForAssets?.cost ?? 0;
  const spendBasis: "modeled" | "allocated" | null =
    modeledSpend > 0 ? "modeled" : allocatedPool > 0 ? "allocated" : null;
  const basisLabel = spendBasis === "allocated" ? "allocated" : "modeled";
  const costById =
    spendBasis === "allocated"
      ? allocateSpendByInvocations(scored, allocatedPool)
      : new Map(scored.map((score) => [score.asset.id, score.usage.cost]));
  const costFor = (id: string) => costById.get(id) ?? 0;

  const assetSpend = [...costById.values()].reduce(
    (sum, cost) => sum + cost,
    0,
  );
  const wastedAssets = wastedSpendAssets(scored, costFor);
  // Free ineffective assets are excluded from the rows but would add zero
  // anyway, so the rows' sum IS the total wasted spend.
  const wasted = wastedAssets.reduce((sum, row) => sum + row.cost, 0);
  const wasteRate = assetSpend ? wasted / assetSpend : 0;
  const view = columnFilters.bind(wastedAssets);

  // Drill from a spend bar (or its keyboard button) into the type-filtered catalogue.
  const drillIntoType = (type: AssetRow["type"]) => {
    setFilters({ ...defaultFilters, type });
    navigate("/catalogue");
  };

  const byType = costByType(scored, costFor);
  const quadrants = ["Stars", "Risks", "Shelfware", "Dead weight"] as const;
  const byQuadrant = quadrants.map((quadrant) => ({
    quadrant,
    cost: Number(
      scored
        .filter((score) => score.quadrant === quadrant)
        .reduce((sum, score) => sum + costFor(score.asset.id), 0)
        .toFixed(2),
    ),
  }));

  return (
    <div className="space-y-4">
      {/* Section A: estimated cost efficiency per model, the headline. */}
      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-3"
        data-rise
        style={rise(0)}
      >
        <KpiCard
          detail={
            costBasis.tracked
              ? "per-asset utilization"
              : `across ${formatNumber(modelTotals.pricedCount)} priced harnesses`
          }
          info="cost.estTotalSpend"
          label={costBasis.tracked ? "Total spend" : "Est. total spend"}
          value={formatCurrencyPrecise(costBasis.totalCost)}
        />
        <KpiCard
          detail={`${formatNumber(costBasis.totalSuccesses)} successes`}
          info="cost.estCostPerSuccess"
          label={costBasis.tracked ? "Cost per success" : "Est. cost per success"}
          tone="good"
          value={
            costBasis.costPerSuccess !== null
              ? formatCurrencyPrecise(costBasis.costPerSuccess)
              : "-"
          }
        />
        <KpiCard
          detail="priced from token usage"
          info="cost.harnessesPriced"
          label="Harnesses priced"
          value={`${formatNumber(modelTotals.pricedCount)} of ${formatNumber(modelTotals.totalCount)}`}
        />
      </section>

      {codexBilling.hasBilling && (
        <section
          className="grid grid-cols-2 gap-4 lg:grid-cols-3"
          data-rise
          style={rise(35)}
        >
          <KpiCard
            detail="ChatGPT/Codex analytics"
            info="cost.actualCodexCredits"
            label="Actual Codex credits"
            value={formatNumber(codexBilling.actualCredits)}
          />
          <KpiCard
            detail="workspace analytics"
            info="cost.actualCodexCredits"
            label="Billed Codex tokens"
            value={formatCompact(codexBilling.billedTokens)}
          />
          <KpiCard
            detail="local rollout coverage"
            info="cost.codexCoverage"
            label="Local token coverage"
            value={
              codexBilling.tokenCoverage !== null
                ? formatPercent(codexBilling.tokenCoverage)
                : "-"
            }
          />
        </section>
      )}

      {/* The estimate is derived, not billed: say so once. Hidden when the basis
          is utilization-backed (a real/modeled figure, not an estimate). */}
      {!costBasis.tracked && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-info/30 bg-info-surface px-3 py-2 text-sm text-info-fg"
          data-rise
          style={rise(40)}
        >
        <Pill severity="info" tone="blue">
          estimated
        </Pill>
        <span className="font-medium">
          Derived from each harness's token usage at model list prices.
        </span>
        <span className="text-muted">
          Prices as of {pricing.asOf}. This is an estimate, not metered billing.
          Edit pricing.json to retune.
        </span>
        </div>
      )}

      <div data-rise style={rise(80)}>
        <Panel
          action={<span className="eyebrow">cheapest success first</span>}
          info="cost.efficiencyByModel"
          title="Cost efficiency by model"
        >
          <p className="mb-2.5 text-xs text-subtle">
            A full-session, token-based estimate of each harness's total spend (a
            whole turn burns full-context tokens, not just the slice attributed to
            one asset). This is a different lens from the catalog-attributed modeled
            per-asset spend in the top KPI and the Spend by asset section below, so
            the two totals are not meant to match.
          </p>
          <CostEfficiencyByModel spend={modelSpend} />
        </Panel>
      </div>

      {/* Section B: asset-level spend (modeled from seed, or allocated from real
          harness spend by invocation share). Only shown when there is any to show. */}
      {assetSpend > 0 && (
        <>
          <div
            className="flex flex-wrap items-baseline justify-between gap-2 pt-1"
            data-rise
            style={rise(140)}
          >
            <h2 className="font-display text-sm font-semibold text-fg">
              Spend by asset
            </h2>
            <span className="text-xs text-subtle">
              {spendBasis === "allocated"
                ? `${harnessForAssets?.label ?? "Harness"} estimated ${formatCurrency(allocatedPool)} token spend, allocated across assets by invocation share. A proxy, not per-asset metering.`
                : "Modeled from the seed, separate from the token estimate above. It ranks which assets waste spend."}
              {meta &&
                ` Window ${formatDate(meta.windowStart)} to ${formatDate(meta.windowEnd)}.`}
            </span>
          </div>

          <div data-rise style={rise(160)}>
            <Panel
              action={
                <span className="eyebrow">
                  {formatPercent(1 - wasteRate)} on effective assets
                </span>
              }
              info="cost.spendEfficiency"
              title={`Spend efficiency (${basisLabel})`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Effective spend</span>
                  <span className="font-mono tabular-nums text-fg">
                    {formatCurrency(assetSpend - wasted)}
                  </span>
                </div>
                <Meter
                  tone="success"
                  value={assetSpend ? (assetSpend - wasted) / assetSpend : 0}
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Wasted spend</span>
                  <span className="font-mono tabular-nums text-fg">
                    {formatCurrency(wasted)}
                  </span>
                </div>
                <Meter tone="danger" value={wasteRate} />
              </div>
            </Panel>
          </div>

          <section
            className="grid gap-4 xl:grid-cols-2"
            data-rise
            style={rise(220)}
          >
            <Panel
              info="cost.whereSpendGoes"
              title={`Where spend goes (${basisLabel})`}
            >
              {byType.length ? (
                <>
                  <p className="mb-1 text-xs text-subtle">
                    Select a type to open its assets in the catalogue.
                  </p>
                  <SimpleBarChart
                    barLabel={(type) => `Open ${type} assets in the catalogue`}
                    data={byType}
                    onBarClick={(type) =>
                      drillIntoType(type as AssetRow["type"])
                    }
                    xKey="type"
                    yKey="cost"
                  />
                </>
              ) : (
                <EmptyState>
                  No per-type cost recorded in this window.
                </EmptyState>
              )}
            </Panel>
            <Panel
              info="cost.spendByQuadrant"
              title={`Spend by quadrant (${basisLabel})`}
            >
              <SimpleBarChart data={byQuadrant} xKey="quadrant" yKey="cost" />
            </Panel>
          </section>

          <div data-rise style={rise(300)}>
            <Panel
              action={
                wastedAssets.length ? (
                  <span className="eyebrow">
                    {columnFilters.activeCount > 0
                      ? `${formatNumber(view.rows.length)} of ${formatNumber(wastedAssets.length)} flagged`
                      : `${formatNumber(wastedAssets.length)} flagged`}
                  </span>
                ) : undefined
              }
              info="cost.topWasted"
              title={`Top wasted spend (${basisLabel})`}
            >
              {wastedAssets.length ? (
                <DataTable
                  caption="Costly but ineffective assets ranked by spend, worst first"
                  minWidth={680}
                >
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="inline-flex items-center gap-1">
                          Asset {view.filterFor("asset")}
                        </span>
                      </th>
                      <th scope="col">
                        <span className="inline-flex items-center gap-1">
                          Type {view.filterFor("type")}
                        </span>
                      </th>
                      <th scope="col">
                        <span className="inline-flex items-center gap-1">
                          Quadrant {view.filterFor("quadrant")}
                        </span>
                      </th>
                      <th scope="col">Cost</th>
                      <th scope="col">Invocations</th>
                      <th scope="col">Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.length === 0 && (
                      <tr>
                        <td className="text-subtle" colSpan={6}>
                          No rows match the column filters.{" "}
                          <button
                            className="font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                            onClick={() => columnFilters.clearAll()}
                            type="button"
                          >
                            Clear column filters
                          </button>
                        </td>
                      </tr>
                    )}
                    {view.rows.map((row) => {
                      const pill = quadrantPill(row.quadrant);
                      return (
                        <tr key={row.asset.id}>
                          <td>
                            <Link
                              className="font-medium text-fg underline-offset-2 hover:text-accent hover:underline
                                focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              to={`/asset/${row.asset.id}`}
                            >
                              {row.asset.name}
                            </Link>
                          </td>
                          <td>
                            <Pill tone="slate">{row.asset.type}</Pill>
                          </td>
                          <td>
                            <Pill severity={pill.severity} tone={pill.tone}>
                              {row.quadrant}
                            </Pill>
                          </td>
                          <td className="font-mono tabular-nums text-danger-fg">
                            {formatCurrency(row.cost)}
                          </td>
                          <td className="font-mono tabular-nums text-muted">
                            {formatNumber(row.invocations)}
                          </td>
                          <td className="font-mono tabular-nums text-muted">
                            {formatPercent(row.successRate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              ) : (
                <EmptyState>
                  No costly-but-ineffective assets in this window. Every asset
                  that spends is earning it.
                </EmptyState>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
