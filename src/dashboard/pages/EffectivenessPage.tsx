import { useRef, useState, type CSSProperties } from "react";

import { useGSAP } from "@gsap/react";
import { Flip } from "gsap/Flip";

import {
  aesEffectiveRate,
  assetTrends,
  classificationCounts,
  classificationReasonFromScore,
  dailySeries,
  hasOnlyProbeTelemetry,
  isConfirmedUnderperformer,
  isProvisionalEffectiveness,
  scoreAssetDetailed,
  scoreAssets,
  usageByModel,
  utilizationByAssetWindowed,
} from "@/data";
import type { AssetScore, EffectivenessTier, Quadrant } from "@/data";
import { useVault } from "@/dashboard/VaultContext";
import { formatNumber, formatPercent } from "@/dashboard/format";
import { Button } from "@/dashboard/components/Button";
import type { ColumnFilterDef } from "@/dashboard/components/columnFilters";
import { DataTable } from "@/dashboard/components/DataTable";
import { EffectivenessByModel } from "@/dashboard/components/EffectivenessByModel";
import { EffectivenessMovers } from "@/dashboard/components/EffectivenessMovers";
import { useColumnFilters } from "@/dashboard/components/useColumnFilters";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { Meter } from "@/dashboard/components/Meter";
import { PageHeader } from "@/dashboard/components/PageHeader";
import { Panel } from "@/dashboard/components/Panel";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { Pill } from "@/dashboard/components/Pill";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";
import { Sparkline } from "@/dashboard/components/Sparkline";
import { DUR, EASE } from "@/motion/tokens";
import { prefersReduced } from "@/motion/useReducedMotion";

const NOT_TRACKED_KEYS = ["refusals", "tokens", "cost"] as const;
type AttentionFilter =
  | "all"
  | "no-telemetry"
  | "shelfware"
  | "dead-weight"
  | "underperforming"
  | "regressing"
  | "insufficient";
// The probe seeds one synthetic invocation for assets with no live usage. This
// control keeps that synthetic usage honest: Live drops probe-only rows, Probe
// isolates them. Only shown when the snapshot actually carries probe-seeded assets.
type TelemetryView = "all" | "live" | "probe";

// Sort keys. Invocations stays the default so the existing caption holds; the
// others let an analyst re-rank by quality, latency, or name. Every key sorts a
// real, tracked field.
type SortKey = "invocations" | "effective" | "success" | "latency" | "name";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "invocations", label: "Invocations" },
  { id: "effective", label: "Effective score" },
  { id: "success", label: "Success rate" },
  { id: "latency", label: "Latency" },
  { id: "name", label: "Name" },
];

// Quadrant order for the group-by view, worst-first so attention items rise.
const QUADRANT_ORDER: Quadrant[] = [
  "Risks",
  "Shelfware",
  "Dead weight",
  "Stars",
];

// Per-column header filters for the ranking table. Asset/Type/Quadrant read
// straight off the scored row, so the defs are static (no dataset closure).
const EFF_COLUMNS: ColumnFilterDef<AssetScore>[] = [
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

/** Stagger surfaces on load through the data-rise animation in main.css. */
const rise = (ms: number): CSSProperties =>
  ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

/** Quadrant drives both the status rail color (token class) and the row Pill tone. */
const QUADRANT_RAIL: Record<Quadrant, string> = {
  Stars: "bg-accent",
  Risks: "bg-danger",
  Shelfware: "bg-warning",
  "Dead weight": "bg-border-strong",
};

const QUADRANT_PILL: Record<Quadrant, "green" | "red" | "amber" | "slate"> = {
  Stars: "green",
  Risks: "red",
  Shelfware: "amber",
  "Dead weight": "slate",
};

/** Effectiveness-tier pill tone for the AES / Confidence column. */
const TIER_PILL: Record<
  EffectivenessTier,
  "green" | "red" | "amber" | "slate"
> = {
  exceptional: "green",
  strong: "green",
  average: "amber",
  weak: "red",
  "insufficient-evidence": "slate",
};

/** Plain-English tier label so the cell reads as words, not a slug. */
const TIER_LABEL: Record<EffectivenessTier, string> = {
  exceptional: "exceptional",
  strong: "strong",
  average: "average",
  weak: "weak",
  "insufficient-evidence": "insufficient evidence",
};

/** Success rate reads green when healthy, amber when soft, red when failing. */
function successTone(rate: number): "success" | "warning" | "danger" {
  if (rate >= 0.75) return "success";
  if (rate >= 0.5) return "warning";
  return "danger";
}

/** Latency in whole milliseconds; zero reads as a dash so it is not mistaken for fast. */
function formatLatency(ms: number): string {
  return ms > 0 ? `${formatNumber(ms)} ms` : "-";
}

/** Compare two scored rows by the active sort key, descending where higher is better. */
function compareBy(key: SortKey, a: AssetScore, b: AssetScore): number {
  switch (key) {
    case "effective":
      return (b.effectiveScore ?? -1) - (a.effectiveScore ?? -1);
    case "success":
      return b.usage.successRate - a.usage.successRate;
    case "latency":
      return b.usage.latencyMs - a.usage.latencyMs;
    case "name":
      return a.asset.name.localeCompare(b.asset.name);
    case "invocations":
    default:
      return b.usage.invocations - a.usage.invocations;
  }
}

export function EffectivenessPage() {
  const { dataset, loading, timeRange } = useVault();
  const [attentionFilter, setAttentionFilter] =
    useState<AttentionFilter>("all");
  const [telemetryView, setTelemetryView] = useState<TelemetryView>("all");
  const [sortKey, setSortKey] = useState<SortKey>("invocations");
  const [grouped, setGrouped] = useState(false);
  const tableScope = useRef<HTMLDivElement>(null);
  // The Flip state captured at the instant a control fires, replayed after the
  // re-render. Null when reduced motion is on, so the layout simply snaps.
  const flipStateRef = useRef<Flip.FlipState | null>(null);

  // Capture the current row layout before a control changes the order, so the
  // useGSAP below can animate from it. A no-op under reduced motion.
  const captureFlip = () => {
    if (prefersReduced() || !tableScope.current) return;
    flipStateRef.current = Flip.getState(
      tableScope.current.querySelectorAll("[data-flip-id]"),
    );
  };

  // Per-column header filters. captureFlip runs before each filter change so the
  // ranking glides to its new order rather than snapping.
  const columnFilters = useColumnFilters(EFF_COLUMNS, {
    onBeforeChange: captureFlip,
  });

  // Replay the captured layout glide after the rows re-rank. Runs after every
  // filter, sort, group, or column-filter change; skips entirely under reduced motion.
  useGSAP(
    () => {
      const state = flipStateRef.current;
      flipStateRef.current = null;
      if (!state) return;
      Flip.from(state, { absolute: true, duration: DUR.sm, ease: EASE.inOut });
    },
    {
      dependencies: [
        attentionFilter,
        telemetryView,
        sortKey,
        grouped,
        columnFilters.signature,
      ],
      scope: tableScope,
    },
  );

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const rows = scoreAssets(dataset, timeRange ?? undefined).sort(
    (a, b) => b.usage.invocations - a.usage.invocations,
  );
  if (rows.length === 0) {
    return (
      <EmptyState>
        No assets to score yet. Add assets from the Catalogue to populate
        effectiveness.
      </EmptyState>
    );
  }

  const modelUsage = usageByModel(dataset, timeRange ?? undefined);

  // The evidence-aware classification census over the active window: quadrant
  // counts over confidently-evaluated assets plus the insufficient-evidence
  // bucket. Rendered as the census strip and reused by the matching
  // needs-attention counts so the two never disagree.
  const census = classificationCounts(dataset, timeRange ?? undefined);

  // Effectiveness drift for every asset over the window (prior vs recent half).
  // Computed once and shared: the movers panel renders both directions, and the
  // "Regressing" attention bucket reads its ids off the same pass.
  const trends = assetTrends(dataset, timeRange ?? undefined);

  // The defensible AES + Evidence Confidence score per asset, over the active
  // window. Computed once off a shared windowed usage map and read by the
  // "AES / Confidence" column. Distinct from the legacy quadrant scoring above.
  const windowedUsage = utilizationByAssetWindowed(
    dataset,
    timeRange ?? undefined,
  );
  const detailByAsset = new Map(
    dataset.assets.map(
      (a) => [a.id, scoreAssetDetailed(a, dataset, windowedUsage)] as const,
    ),
  );

  const tracked = dataset.telemetryMeta?.tracked;
  const notTracked = tracked
    ? NOT_TRACKED_KEYS.filter((key) => tracked[key] === false)
    : [];
  // "No telemetry" means the asset has no utilization rows at all, distinct from
  // a measured zero (rows exist but none land in the active window). The gate
  // follows the data, not the asset type: any asset the collector observed (hooks
  // and commands included) reports, and any it never saw reads "no telemetry".
  const telemetryAssetIds = new Set(
    dataset.utilization.map((row) => row.assetId),
  );
  const noTelemetry = (row: AssetScore) => !telemetryAssetIds.has(row.asset.id);
  // A confirmed underperformer: trustworthy evidence (grade A-C) whose AES tier is
  // weak. The actionable inverse of insufficient evidence: fix or retire it rather
  // than just gather more data. Reads the detailed AES result, not the legacy quadrant.
  const isUnderperformer = (row: AssetScore): boolean => {
    const detail = detailByAsset.get(row.asset.id);
    return detail ? isConfirmedUnderperformer(detail) : false;
  };

  // Assets whose only telemetry is the synthetic probe row. Computed over the full
  // utilization (not the windowed score) since probe-only is a property of the
  // asset's telemetry, not the active window.
  const probeOnlyIds = new Set(
    (dataset.telemetryMeta?.probeAssetIds ?? []).filter((id) =>
      hasOnlyProbeTelemetry(id, dataset.utilization, dataset.telemetryMeta),
    ),
  );
  const isProbeRow = (row: AssetScore) => probeOnlyIds.has(row.asset.id);
  // Assets whose effectiveness fell on trustworthy evidence between the prior and
  // recent halves of the window. A confirmed decline, distinct from a low score:
  // the asset was good and is sliding, so it earns its own attention bucket.
  const regressingIds = new Set(
    trends
      .filter((trend) => trend.direction === "regressing")
      .map((trend) => trend.assetId),
  );
  const isRegressing = (row: AssetScore) => regressingIds.has(row.asset.id);
  const attentionFilters: {
    id: AttentionFilter;
    label: string;
    count: number;
  }[] = [
    { id: "all", label: "All ranked", count: rows.length },
    {
      id: "no-telemetry",
      label: "No telemetry",
      count: rows.filter(noTelemetry).length,
    },
    {
      id: "shelfware",
      label: "Shelfware",
      count: census.Shelfware,
    },
    {
      id: "dead-weight",
      label: "Dead weight",
      count: census["Dead weight"],
    },
    {
      id: "underperforming",
      label: "Underperforming",
      count: rows.filter(isUnderperformer).length,
    },
    {
      id: "regressing",
      label: "Regressing",
      count: rows.filter(isRegressing).length,
    },
    {
      id: "insufficient",
      label: "Insufficient evidence",
      count: census.insufficientEvidence,
    },
  ];
  const filteredRows = rows.filter((row) => {
    if (attentionFilter === "no-telemetry") return noTelemetry(row);
    if (attentionFilter === "shelfware")
      return row.quadrant === "Shelfware" && row.evidenceSufficient;
    if (attentionFilter === "dead-weight")
      return row.quadrant === "Dead weight" && row.evidenceSufficient;
    if (attentionFilter === "underperforming") return isUnderperformer(row);
    if (attentionFilter === "regressing") return isRegressing(row);
    if (attentionFilter === "insufficient") return !row.evidenceSufficient;
    return true;
  });

  // Live vs probe split, applied on top of the attention filter. Only meaningful
  // when the snapshot seeded probe rows, so the control itself is hidden otherwise.
  const telemetryFilters: {
    id: TelemetryView;
    label: string;
    count: number;
  }[] = [
    { id: "all", label: "All", count: filteredRows.length },
    {
      id: "live",
      label: "Live only",
      count: filteredRows.filter((row) => !isProbeRow(row)).length,
    },
    {
      id: "probe",
      label: "Probe only",
      count: filteredRows.filter(isProbeRow).length,
    },
  ];
  const visibleRows = filteredRows.filter((row) => {
    if (telemetryView === "live") return !isProbeRow(row);
    if (telemetryView === "probe") return isProbeRow(row);
    return true;
  });

  // Per-column header filters apply on top of the attention/telemetry filters,
  // before sorting and grouping, so the funnels refine whatever is in view.
  const view = columnFilters.bind(visibleRows);

  // Apply the active sort, then optionally bucket by quadrant. Grouping keeps
  // the same in-group sort so a re-rank reads consistently in either layout.
  const sortedRows = [...view.rows].sort((a, b) => compareBy(sortKey, a, b));
  const groups: { quadrant: Quadrant; rows: AssetScore[] }[] = grouped
    ? QUADRANT_ORDER.map((quadrant) => ({
        quadrant,
        rows: sortedRows.filter((row) => row.quadrant === quadrant),
      })).filter((group) => group.rows.length > 0)
    : [{ quadrant: "Stars", rows: sortedRows }];

  // Headline numbers, computed only over assets that actually report telemetry so
  // the rates are not diluted by assets that read "no telemetry".
  const measured = rows.filter((row) => telemetryAssetIds.has(row.asset.id));
  // Headlines reflect live usage only: a probe-only asset's single synthetic call
  // must not pad total invocations or inflate the success rate.
  const liveMeasured = measured.filter((row) => !isProbeRow(row));
  const totalInvocations = liveMeasured.reduce(
    (sum, row) => sum + row.usage.invocations,
    0,
  );
  const totalSuccesses = liveMeasured.reduce(
    (sum, row) => sum + row.usage.successes,
    0,
  );
  const avgSuccessRate = totalInvocations
    ? totalSuccesses / totalInvocations
    : 0;
  // The confidence-aware fleet effectiveness rate (the defensible headline): the
  // share of CONFIDENTLY-EVALUATED assets (evidence grade A/B/C) whose AES tier is
  // exceptional or strong. Low-evidence assets (grade D/E) are reported separately
  // as "need more evidence" rather than diluting the denominator as if they were
  // ineffective, which is the core point of the AES + Evidence Confidence model.
  const aes = aesEffectiveRate(dataset, timeRange ?? undefined);

  const renderRow = (row: AssetScore) => {
    const rowHasNoTelemetry = noTelemetry(row);
    // A probe-only row's success rate, effective score, and latency are all derived
    // from one synthetic call, so they are meaningless. Render them muted rather
    // than as a green 100% / accent meter that would read as real usage.
    const rowIsProbe = isProbeRow(row);
    const series = rowHasNoTelemetry
      ? []
      : dailySeries(dataset, row.asset.id, timeRange ?? undefined);
    return (
      <tr data-flip-id={row.asset.id} key={row.asset.id}>
        <td>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={`inline-block h-6 w-1 shrink-0 rounded-full ${QUADRANT_RAIL[row.quadrant]}`}
              title={row.quadrant}
            />
            <div className="min-w-0">
              <div className="truncate font-medium text-fg">
                {row.asset.name}
              </div>
              {isProbeRow(row) && (
                <div className="mt-0.5">
                  <Pill severity="warn" tone="amber">
                    probe
                  </Pill>
                </div>
              )}
              {row.stale && (
                <div className="eyebrow text-warning-fg">stale</div>
              )}
            </div>
          </div>
        </td>
        <td>
          <Pill tone="slate">{row.asset.type}</Pill>
        </td>
        <td className="font-mono tabular-nums text-muted">
          {rowHasNoTelemetry ? (
            <span className="text-subtle">no telemetry</span>
          ) : (
            formatNumber(row.usage.invocations)
          )}
        </td>
        <td>
          {rowHasNoTelemetry ? (
            <Sparkline
              label={`${row.asset.name} activity`}
              series={[]}
              width={64}
            />
          ) : (
            <Sparkline
              className="text-accent"
              fill
              label={`${row.asset.name} daily invocations`}
              series={series}
              width={64}
            />
          )}
        </td>
        <td className="min-w-[8rem]">
          {rowHasNoTelemetry ? (
            <span className="font-mono text-xs text-subtle">no telemetry</span>
          ) : rowIsProbe ? (
            <span className="font-mono text-xs text-subtle">synthetic</span>
          ) : (
            <Meter
              label={`${row.asset.name} success rate`}
              showValue
              tone={successTone(row.usage.successRate)}
              value={row.usage.successRate}
            />
          )}
        </td>
        <td className="min-w-[8rem]">
          {rowIsProbe ? (
            <span className="font-mono text-xs text-subtle">synthetic</span>
          ) : row.effectiveScore === null ? (
            <span className="font-mono text-xs text-subtle">no score</span>
          ) : (
            <Meter
              label={`${row.asset.name} effective score`}
              showValue
              tone="accent"
              value={row.effectiveScore}
            />
          )}
        </td>
        <td className="min-w-[9rem]">
          {(() => {
            const detail = detailByAsset.get(row.asset.id);
            if (!detail) return null;
            const insufficient =
              detail.effectivenessTier === "insufficient-evidence";
            // A "looks strong but unproven" mirage: a high AES gated to
            // insufficient evidence (grade D/E). Surface the tempting score in
            // amber with a warning instead of hiding it, so a naive read does not
            // mistake it for a top performer. Synthetic probe rows are never
            // flagged: their one call is not real evidence to weigh in the first
            // place.
            const provisional =
              !rowIsProbe && isProvisionalEffectiveness(detail);
            return (
              <div className="flex flex-col gap-1">
                {insufficient && !provisional ? (
                  <span className="font-mono text-xs text-subtle">
                    {TIER_LABEL[detail.effectivenessTier]}
                  </span>
                ) : (
                  <Meter
                    label={`${row.asset.name} effectiveness (AES)`}
                    showValue
                    tone={provisional ? "warning" : "accent"}
                    value={detail.assetEffectivenessScore}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  {provisional ? (
                    <span title="High AES on thin evidence (grade D or E): the score looks strong but is not trustworthy yet. Needs more invocations to verify.">
                      <Pill severity="warn" tone="amber">
                        unverified
                      </Pill>
                    </span>
                  ) : (
                    !insufficient && (
                      <Pill tone={TIER_PILL[detail.effectivenessTier]}>
                        {TIER_LABEL[detail.effectivenessTier]}
                      </Pill>
                    )
                  )}
                  <span
                    className="eyebrow text-subtle"
                    title="Evidence confidence grade (A best, E weakest)"
                  >
                    grade {detail.evidenceConfidenceGrade}
                  </span>
                </div>
              </div>
            );
          })()}
        </td>
        <td className="font-mono tabular-nums text-muted">
          {rowHasNoTelemetry ? (
            <span className="text-subtle">no telemetry</span>
          ) : rowIsProbe ? (
            <span className="text-subtle">synthetic</span>
          ) : (
            formatLatency(row.usage.latencyMs)
          )}
        </td>
        <td className="min-w-[8rem]">
          <Meter
            label={`${row.asset.name} governed score`}
            showValue
            tone="accent"
            value={row.governedScore}
          />
        </td>
        <td>
          <Pill tone={QUADRANT_PILL[row.quadrant]}>{row.quadrant}</Pill>
          {(() => {
            const reason = classificationReasonFromScore(row, dataset);
            return reason ? (
              <div className="mt-1 max-w-[16rem] text-xs text-subtle">
                {reason}
              </div>
            ) : null;
          })()}
        </td>
      </tr>
    );
  };

  // The ranking controls (Needs attention / Telemetry / Sort+Group). They live
  // in the shared PageHeader toolbar, OUTSIDE the GSAP Flip scope (tableScope),
  // so capturing and replaying the row layout still works. Each onClick is kept
  // verbatim from the prior inline placement.
  const rankingToolbar = (
    <div className="flex w-full flex-col gap-3">
      <section
        className="rounded-lg border border-border bg-surface-muted/60 p-3"
        aria-labelledby="needs-attention-heading"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3
              className="font-display text-sm font-semibold text-fg"
              id="needs-attention-heading"
            >
              Needs attention
            </h3>
            <p className="mt-1 text-xs text-subtle">
              Filter the ranking to rows that need telemetry, pruning, or
              follow-up.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attentionFilters.map((filter) => (
              <Button
                aria-pressed={attentionFilter === filter.id}
                key={filter.id}
                onClick={() => {
                  captureFlip();
                  setAttentionFilter(filter.id);
                }}
                size="sm"
                type="button"
                variant={
                  attentionFilter === filter.id ? "primary" : "secondary"
                }
              >
                {filter.label}
                <span className="font-mono tabular-nums">{filter.count}</span>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {probeOnlyIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow" id="telemetry-label">
            Telemetry
          </span>
          <InfoTooltip
            label={TOOLTIPS["effectiveness.telemetrySource"]}
            triggerLabel="About probe-seeded telemetry"
          />
          <div
            aria-labelledby="telemetry-label"
            className="flex flex-wrap gap-1.5"
            role="group"
          >
            {telemetryFilters.map((filter) => (
              <Button
                aria-pressed={telemetryView === filter.id}
                key={filter.id}
                onClick={() => {
                  captureFlip();
                  setTelemetryView(filter.id);
                }}
                size="sm"
                type="button"
                variant={telemetryView === filter.id ? "primary" : "secondary"}
              >
                {filter.label}
                <span className="font-mono tabular-nums">{filter.count}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow" id="sort-label">
            Sort by
          </span>
          <div
            aria-labelledby="sort-label"
            className="flex flex-wrap gap-1.5"
            role="group"
          >
            {SORTS.map((option) => (
              <Button
                aria-pressed={sortKey === option.id}
                key={option.id}
                onClick={() => {
                  captureFlip();
                  setSortKey(option.id);
                }}
                size="sm"
                type="button"
                variant={sortKey === option.id ? "primary" : "secondary"}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <Button
          aria-pressed={grouped}
          onClick={() => {
            captureFlip();
            setGrouped((current) => !current);
          }}
          size="sm"
          type="button"
          variant={grouped ? "primary" : "secondary"}
        >
          {grouped ? "Grouped by quadrant" : "Group by quadrant"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div data-rise style={rise(0)}>
        <PageHeader
          kpiColumns={4}
          kpis={
            <>
              <KpiCard
                className="border-l-4 border-l-accent"
                countFormat={(value) => formatPercent(value)}
                countTo={aes.rate}
                detail={`${aes.effectiveCount} of ${aes.evaluatedCount} evaluated, ${aes.insufficientEvidence} need more evidence`}
                info="effectiveness.effectiveRate"
                label="AES Effective Rate"
                tone="good"
                value={formatPercent(aes.rate)}
              />
              <KpiCard
                countFormat={(value) => formatPercent(value)}
                countTo={avgSuccessRate}
                detail="across live assets"
                info="effectiveness.avgSuccess"
                label="Avg success rate"
                value={formatPercent(avgSuccessRate)}
              />
              <KpiCard
                countFormat={formatNumber}
                countTo={totalInvocations}
                detail="last telemetry window"
                info="effectiveness.totalInvocations"
                label="Total invocations"
                value={formatNumber(totalInvocations)}
              />
              <KpiCard
                countFormat={formatNumber}
                countTo={aes.effectiveCount}
                detail={`${liveMeasured.length} report live telemetry`}
                info="effectiveness.effectiveAssets"
                label="Effective assets"
                value={formatNumber(aes.effectiveCount)}
              />
            </>
          }
          toolbar={rankingToolbar}
        />
      </div>

      <div data-rise style={rise(100)}>
        <Panel title="Effectiveness by model">
          <EffectivenessByModel usage={modelUsage} />
        </Panel>
      </div>

      <div data-rise style={rise(110)}>
        <Panel
          action={<span className="eyebrow">prior vs recent window</span>}
          title="Effectiveness movers"
        >
          <EffectivenessMovers assets={dataset.assets} trends={trends} />
        </Panel>
      </div>

      <div data-rise style={rise(120)}>
        <Panel
          action={
            <span className="eyebrow">
              {columnFilters.activeCount > 0
                ? `${view.rows.length} of ${visibleRows.length} ranked`
                : `${view.rows.length} ranked`}
            </span>
          }
          info="effectiveness.ranking"
          title="Effectiveness ranking"
        >
          <div
            aria-label="Classification census"
            className="mb-3 flex flex-wrap items-center gap-2"
            role="group"
          >
            <span className="eyebrow">Classification census</span>
            {(["Stars", "Risks", "Shelfware", "Dead weight"] as const).map(
              (quadrant) => (
                <Pill key={quadrant} tone={QUADRANT_PILL[quadrant]}>
                  {quadrant}{" "}
                  <span className="font-mono tabular-nums">
                    {census[quadrant]}
                  </span>
                </Pill>
              ),
            )}
            <Pill tone="slate">
              insufficient evidence{" "}
              <span className="font-mono tabular-nums">
                {census.insufficientEvidence}
              </span>
            </Pill>
          </div>
          <div ref={tableScope}>
            <DataTable
              caption="Asset effectiveness scores ranked by invocations"
              minWidth={1000}
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
                  <th scope="col">Invocations</th>
                  <th scope="col">Trend</th>
                  <th scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      Success
                      <InfoTooltip
                        align="center"
                        label={TOOLTIPS["effectiveness.colSuccess"]}
                        triggerLabel="About success rate"
                      />
                    </span>
                  </th>
                  <th scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      Effective
                      <InfoTooltip
                        align="center"
                        label={TOOLTIPS["effectiveness.colEffective"]}
                        triggerLabel="About effective score"
                      />
                    </span>
                  </th>
                  <th scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      AES / Confidence
                      <InfoTooltip
                        align="center"
                        label={TOOLTIPS["effectiveness.colAes"]}
                        triggerLabel="About AES and evidence confidence"
                      />
                    </span>
                  </th>
                  <th scope="col">Latency</th>
                  <th scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      Governed
                      <InfoTooltip
                        align="center"
                        label={TOOLTIPS["effectiveness.colGoverned"]}
                        triggerLabel="About governed score"
                      />
                    </span>
                  </th>
                  <th scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      Quadrant
                      <InfoTooltip
                        align="end"
                        label={TOOLTIPS["effectiveness.colQuadrant"]}
                        triggerLabel="About quadrant"
                      />
                      {view.filterFor("quadrant")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.length === 0 ? (
                  <tr>
                    <td className="text-subtle" colSpan={10}>
                      {columnFilters.activeCount > 0 ? (
                        <>
                          No rows match the column filters.{" "}
                          <button
                            className="font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                            onClick={() => columnFilters.clearAll()}
                            type="button"
                          >
                            Clear column filters
                          </button>
                        </>
                      ) : (
                        "No assets match the current filters."
                      )}
                    </td>
                  </tr>
                ) : grouped ? (
                  groups.flatMap((group) => [
                    <tr
                      key={`group-${group.quadrant}`}
                      className="bg-surface-inset/50"
                    >
                      <td className="eyebrow text-subtle" colSpan={10}>
                        {group.quadrant} ({group.rows.length})
                      </td>
                    </tr>,
                    ...group.rows.map(renderRow),
                  ])
                ) : (
                  groups[0].rows.map(renderRow)
                )}
              </tbody>
            </DataTable>
          </div>
          {notTracked.length > 0 && (
            <p className="mt-3 text-xs text-subtle">
              Not tracked yet: {notTracked.join(", ")}.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
