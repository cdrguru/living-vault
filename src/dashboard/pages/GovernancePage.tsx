import { type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { partitionGovernance, utilizationByOrigin } from "@/data";
import type { AssetRow } from "@/data";
import { useVault } from "@/dashboard/VaultContext";
import { formatCurrency, formatNumber } from "@/dashboard/format";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { Panel } from "@/dashboard/components/Panel";
import { Pill } from "@/dashboard/components/Pill";
import { SectionCard } from "@/dashboard/components/SectionCard";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";

function AssetPills({
  assets,
  tone,
  severity,
}: {
  assets: AssetRow[];
  tone: "green" | "amber" | "red" | "slate";
  severity: "good" | "warn" | "danger" | "neutral";
}) {
  if (assets.length === 0) {
    return <p className="mt-2 text-xs text-subtle">None.</p>;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {assets.map((asset) => (
        <li key={asset.id}>
          <Link
            aria-label={`Open ${asset.name}`}
            className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to={`/asset/${asset.id}`}
          >
            <Pill severity={severity} tone={tone}>
              {asset.name}
            </Pill>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The governance page surfaces two named pitch outputs that had metrics but no
 * home: the governed-vs-orphaned asset split (partitionGovernance) and utilization
 * traced to the upstream origin each asset came from (utilizationByOrigin). Both
 * read the loaded VaultDataset through pure selectors; this page mutates nothing.
 */
export function GovernancePage() {
  const { dataset, loading } = useVault();

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const { governed, orphaned, ungoverned } = partitionGovernance(dataset);
  const byOrigin = utilizationByOrigin(dataset);
  const total = dataset.assets.length;
  const governedRate = total ? governed.length / total : 0;
  const tracedOrigins = byOrigin.filter((row) => row.origin !== null).length;

  return (
    <div className="space-y-4">
      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        data-rise
        style={{ ["--rise-delay"]: "0ms" } as CSSProperties}
      >
        <KpiCard
          detail={`${governed.length} of ${total} assets`}
          label="Governed"
          tone={governedRate >= 0.5 ? "good" : "neutral"}
          value={formatNumber(governed.length)}
        />
        <KpiCard
          detail="Owned, below the governance bar"
          label="Needs governance"
          tone={ungoverned.length ? "warn" : "neutral"}
          value={formatNumber(ungoverned.length)}
        />
        <KpiCard
          detail="No owner of record"
          label="Orphaned"
          tone={orphaned.length ? "risk" : "neutral"}
          value={formatNumber(orphaned.length)}
        />
        <KpiCard
          detail="Distinct upstream sources"
          label="Upstream origins"
          value={formatNumber(tracedOrigins)}
        />
      </section>

      <div data-rise style={{ ["--rise-delay"]: "80ms" } as CSSProperties}>
        <Panel
          action={<span className="eyebrow">governed vs orphaned</span>}
          title="Governance posture"
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <SectionCard>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">Governed</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {governed.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Owned and at or above the governance bar.
              </p>
              <AssetPills assets={governed} severity="good" tone="green" />
            </SectionCard>
            <SectionCard tone="warning">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-warning-fg">
                  Needs governance
                </span>
                <span className="font-mono text-xs tabular-nums text-warning-fg/80">
                  {ungoverned.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-warning-fg/80">
                Owned but failing governance checks. Open to close the gaps.
              </p>
              <AssetPills assets={ungoverned} severity="warn" tone="amber" />
            </SectionCard>
            <SectionCard tone="warning">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-warning-fg">
                  Orphaned
                </span>
                <span className="font-mono text-xs tabular-nums text-warning-fg/80">
                  {orphaned.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-warning-fg/80">
                No owner of record. Assign an owner to bring under governance.
              </p>
              <AssetPills assets={orphaned} severity="danger" tone="red" />
            </SectionCard>
          </div>
        </Panel>
      </div>

      <div data-rise style={{ ["--rise-delay"]: "160ms" } as CSSProperties}>
        <Panel
          action={<span className="eyebrow">{tracedOrigins} sources</span>}
          title="Upstream library usage"
        >
          <p className="mb-3 text-xs text-muted">
            Utilization rolled up to the upstream source each asset came from,
            so a library repo can be traced to the invocations it drives.
          </p>
          {byOrigin.length === 0 ? (
            <EmptyState>
              No assets to trace yet. Sync the catalog to populate origins.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="py-2 pr-3 font-medium">Origin</th>
                    <th className="py-2 pr-3 text-right font-medium">Assets</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Invocations
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">Errors</th>
                    <th className="py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byOrigin.map((row) => (
                    <tr
                      className="border-b border-border/60 last:border-0"
                      key={row.origin?.id ?? "__none__"}
                    >
                      <td className="py-2 pr-3">
                        {row.origin ? (
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-fg">
                              {row.origin.name}
                            </span>
                            <Pill severity="info" tone="blue">
                              {row.origin.kind}
                            </Pill>
                            {row.origin.url && (
                              <a
                                className="truncate text-xs text-accent underline-offset-2 hover:underline"
                                href={row.origin.url}
                                rel="noreferrer"
                                target="_blank"
                                title={row.origin.url}
                              >
                                link
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">
                            No recorded origin (local / ungoverned)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                        {formatNumber(row.assetCount)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-fg">
                        {formatNumber(row.invocations)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                        {formatNumber(row.errors)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-muted">
                        {formatCurrency(row.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
