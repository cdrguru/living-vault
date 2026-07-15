import { Link } from "react-router-dom";

import type { AssetRow, AssetScoreResult, AssetTrend } from "@/data";
import { formatPercent } from "@/dashboard/format";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { Pill } from "@/dashboard/components/Pill";

// How many movers to show per side. The full ranking table below lists every
// asset, so this panel is the at-a-glance "who moved most" summary; a longer
// list would just duplicate the table. A count note names anything not shown.
const TOP_N = 6;

/** A trend we can render: its asset resolved, both halves scored, a real delta. */
interface Mover {
  asset: AssetRow;
  recent: AssetScoreResult;
  prior: AssetScoreResult;
  delta: number;
}

/** Signed AES change in whole percentage points, e.g. "+12%" or "-14%". */
function signedPercent(delta: number): string {
  return `${delta >= 0 ? "+" : "-"}${formatPercent(Math.abs(delta))}`;
}

/** An up or down chevron; decorative, the sign and heading carry the meaning. */
function DirectionChevron({ up }: { up: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.25"
      viewBox="0 0 16 16"
      width="14"
    >
      {up ? <path d="M8 12.5V3.5M4 7l4-3.5L12 7" /> : <path d="M8 3.5v9M4 9l4 3.5L12 9" />}
    </svg>
  );
}

function MoverRow({ mover, up }: { mover: Mover; up: boolean }) {
  const toneText = up ? "text-success-fg" : "text-danger-fg";
  return (
    <li className="rounded-lg border border-border bg-surface-inset p-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          className="min-w-0 truncate font-medium text-fg underline-offset-2 hover:text-accent hover:underline
            focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to={`/asset/${mover.asset.id}`}
        >
          {mover.asset.name}
        </Link>
        <span
          className={`flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums ${toneText}`}
        >
          <DirectionChevron up={up} />
          {signedPercent(mover.delta)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <Pill tone="slate">{mover.asset.type}</Pill>
        <span className="font-mono text-xs tabular-nums text-muted">
          was {formatPercent(mover.prior.assetEffectivenessScore)}
          <span aria-hidden="true" className="mx-1 text-subtle">
            &rarr;
          </span>
          now {formatPercent(mover.recent.assetEffectivenessScore)}
        </span>
      </div>
    </li>
  );
}

function MoverColumn({
  movers,
  total,
  up,
  headingId,
}: {
  movers: Mover[];
  total: number;
  up: boolean;
  headingId: string;
}) {
  const shown = movers.slice(0, TOP_N);
  const hidden = total - shown.length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={up ? "text-success-fg" : "text-danger-fg"}>
          <DirectionChevron up={up} />
        </span>
        <h3 className="font-display text-sm font-semibold text-fg" id={headingId}>
          {up ? "Improving" : "Regressing"}
        </h3>
        <span className="font-mono text-xs tabular-nums text-subtle">{total}</span>
      </div>
      {shown.length > 0 ? (
        <>
          <ul aria-labelledby={headingId} className="space-y-2">
            {shown.map((mover) => (
              <MoverRow key={mover.asset.id} mover={mover} up={up} />
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-2 text-xs text-subtle">
              +{hidden} more {up ? "improving" : "regressing"} in the ranking below.
            </p>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-subtle">
          {up
            ? "No asset gained ground this window."
            : "No asset lost ground this window."}
        </p>
      )}
    </div>
  );
}

/**
 * Effectiveness movers: which assets gained or lost effectiveness (AES) between
 * the prior and recent halves of the active window. The regressing side already
 * feeds a filter and the Overview count; this surfaces the improving side and the
 * signed magnitude that assetTrends computes but nothing else renders. Only
 * confidence-gated moves count: a shift on thin evidence reads as "steady" or
 * "not enough evidence", never as a false mover. See
 * docs/superpowers/specs/2026-06-24-effectiveness-drift-design.md.
 */
export function EffectivenessMovers({
  trends,
  assets,
}: {
  trends: AssetTrend[];
  assets: AssetRow[];
}) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  // Only confirmed movers: "steady" trends also carry a delta (within the +/-0.10
  // band), so gate on direction, not on the delta being non-zero, or a steady
  // asset would show up as a small "+5%" improver. improving => delta >= +0.10,
  // regressing => delta <= -0.10, so splitting the movers by sign is then exact.
  const movers = trends.reduce<Mover[]>((acc, trend) => {
    const asset = assetById.get(trend.assetId);
    if (
      asset &&
      trend.recent &&
      trend.prior &&
      trend.delta !== null &&
      (trend.direction === "improving" || trend.direction === "regressing")
    ) {
      acc.push({ asset, recent: trend.recent, prior: trend.prior, delta: trend.delta });
    }
    return acc;
  }, []);

  const improving = movers
    .filter((mover) => mover.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.asset.name.localeCompare(b.asset.name));
  const regressing = movers
    .filter((mover) => mover.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.asset.name.localeCompare(b.asset.name));

  const steady = trends.filter((trend) => trend.direction === "steady").length;
  const insufficient = trends.filter(
    (trend) => trend.direction === "insufficient",
  ).length;

  // Nothing moved. Two honest reasons, kept distinct: either there was not enough
  // trusted history to compare two windows at all, or there was and everything
  // held steady. Never render a false "no movement" over thin data.
  if (improving.length === 0 && regressing.length === 0) {
    const noComparable = insufficient === trends.length;
    return (
      <EmptyState>
        {noComparable
          ? "Not enough history yet. A trend needs two windows of trusted evidence to compare; it appears as usage accumulates."
          : `No effectiveness movement in this window. ${steady} tracked ${steady === 1 ? "asset" : "assets"} held steady.`}
      </EmptyState>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-subtle">
        Change in each asset's effectiveness score between the prior and recent
        halves of the window. {steady} steady
        <span aria-hidden="true" className="mx-1.5 text-border-strong">
          &middot;
        </span>
        {insufficient} not enough evidence.
      </p>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <MoverColumn
          headingId="movers-improving"
          movers={improving}
          total={improving.length}
          up
        />
        <MoverColumn
          headingId="movers-regressing"
          movers={regressing}
          total={regressing.length}
          up={false}
        />
      </div>
    </div>
  );
}
