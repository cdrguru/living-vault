import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  assetHonesty,
  assetSignal,
  assetTrend,
  bundlesOf,
  classificationReason,
  dailySeries,
  dependenciesOf,
  evalPassRate,
  evalResultsByAsset,
  governanceChecks,
  hasOnlyProbeTelemetry,
  scoreAsset,
  utilizationByAsset,
} from "@/data";
import type { AssetRow, HonestyGrade, TagRow } from "@/data";
import { lifecycleOf, scopeOf } from "@/data/assetStatus";
import { useVault } from "@/dashboard/VaultContext";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/dashboard/format";
import { AssetStateBadges } from "@/dashboard/components/AssetStateBadge";
import { Button } from "@/dashboard/components/Button";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { GovernanceChecklist } from "@/dashboard/components/GovernanceChecklist";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { Meter } from "@/dashboard/components/Meter";
import { Panel } from "@/dashboard/components/Panel";
import {
  Pill,
  type PillSeverity,
  type PillTone,
} from "@/dashboard/components/Pill";
import { SearchInput } from "@/dashboard/components/SearchInput";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";
import { Sparkline } from "@/dashboard/components/Sparkline";
import { lifecyclePill, riskPill } from "@/dashboard/statusPill";

import {
  filterRelatedAssets,
  getRelatedAssets,
  type RelatedAssetViewModel,
} from "./relatedAssets";

/** Scope reads blue for plugin-managed, slate for project-specific. */
const SCOPE_TONE: Record<NonNullable<ReturnType<typeof scopeOf>>, PillTone> = {
  "plugin-managed": "blue",
  "project-specific": "slate",
};

/**
 * Measurement honesty reads green when telemetry is fully measured, amber when
 * degraded (partial or derived), blue for the synthetic probe (matching the
 * probe banner), slate when the asset has no telemetry at all.
 */
const HONESTY_TONE: Record<HonestyGrade, PillTone> = {
  full: "green",
  partial: "amber",
  occupancy: "blue",
  derived: "amber",
  none: "slate",
};

/** Honesty severity pairs a glyph with the tone so grades never differ by color alone. */
const HONESTY_SEVERITY: Record<HonestyGrade, PillSeverity> = {
  full: "good",
  partial: "warn",
  occupancy: "info",
  derived: "warn",
  none: "neutral",
};
/** Success rate reads green when healthy, amber when soft, red when failing. */
function successMeterTone(rate: number): "success" | "warning" | "danger" {
  if (rate >= 0.75) return "success";
  if (rate >= 0.5) return "warning";
  return "danger";
}

/**
 * Static Tailwind classes for the usage-trend sparkline so the JIT scanner can
 * see them. A measured-zero asset reads subtle, otherwise tone tracks health.
 */
const TREND_TONE_CLASS: Record<"success" | "warning" | "danger", string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function successKpiTone(rate: number): "good" | "warn" | "risk" {
  if (rate >= 0.75) return "good";
  if (rate >= 0.5) return "warn";
  return "risk";
}

/** A label / value pair in the metadata Panel; the value font is mono when it is a number, id, or date. */
function MetaItem({
  label,
  children,
  mono = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="eyebrow">{label}</dt>
      <dd
        className={`mt-1 text-sm text-fg ${mono ? "font-mono tabular-nums" : ""}`.trim()}
      >
        {children}
      </dd>
    </div>
  );
}

/** A row of Pills for one tag kind; renders a quiet placeholder when the kind is empty. */
function TagGroup({
  label,
  tags,
  tone,
}: {
  label: string;
  tags: TagRow[];
  tone: PillTone;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {tags.length ? (
          tags.map((tag) => (
            <Pill key={tag.id} tone={tone}>
              {tag.name}
            </Pill>
          ))
        ) : (
          <span className="text-sm text-subtle">None</span>
        )}
      </div>
    </div>
  );
}

/** A linked asset reference used by the requires / required-by relationship lists. */
function RelationLink({ asset }: { asset: AssetRow }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 shadow-card transition-colors hover:border-border-strong hover:bg-surface-inset"
      to={`/asset/${asset.id}`}
    >
      <span className="min-w-0 truncate text-sm font-medium text-fg">
        {asset.name}
      </span>
      <span className="shrink-0">
        <Pill tone="slate">{asset.type}</Pill>
      </span>
    </Link>
  );
}

/** A related-asset row: name, type, status, and every plain-English reason it matched. */
function RelatedAssetRow({ item }: { item: RelatedAssetViewModel }) {
  const { asset, reasons } = item;
  const status = lifecyclePill(asset.status);
  return (
    <Link
      className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 shadow-card transition-colors hover:border-border-strong hover:bg-surface-inset"
      to={`/asset/${asset.id}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-fg">
          {asset.name}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone="slate">{asset.type}</Pill>
          <Pill severity={status.severity} tone={status.tone}>
            {lifecycleOf(asset.status)}
          </Pill>
        </div>
      </div>
      <div className="truncate font-mono text-xs text-subtle">{asset.slug}</div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
        {reasons.map((reason) => (
          <span className="break-words" key={reason.key}>
            {reason.label}
          </span>
        ))}
      </div>
    </Link>
  );
}

export function AssetDetailPage() {
  const { dataset, loading, retireAsset } = useVault();
  const { assetId } = useParams();
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState("");

  // The route reuses this component instance across a bare :assetId change
  // (e.g. clicking a related-asset link), so a leftover search query would
  // otherwise carry over onto the next asset's panel.
  useEffect(() => {
    setRelatedQuery("");
  }, [assetId]);

  const asset = dataset?.assets.find((row) => row.id === assetId);

  // Full-dataset scans, so memoized: otherwise every keystroke in the related
  // search field would re-derive the whole related-assets list from scratch.
  const relatedAssets = useMemo(
    () => (dataset && asset ? getRelatedAssets(dataset, asset.id) : []),
    [dataset, asset],
  );
  const filteredRelatedAssets = useMemo(
    () => filterRelatedAssets(relatedAssets, relatedQuery),
    [relatedAssets, relatedQuery],
  );

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonKpiRow />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!asset) {
    return (
      <EmptyState>
        That asset is not in the catalogue.{" "}
        <Link
          className="font-medium text-accent-strong hover:underline"
          to="/catalogue"
        >
          Return to the Catalogue
        </Link>
        .
      </EmptyState>
    );
  }

  const score = scoreAsset(asset, dataset, utilizationByAsset(dataset));
  const honesty = assetHonesty(dataset, asset.id, score.usage);
  const trend = assetTrend(dataset, asset.id);
  const signal = assetSignal(dataset, asset.id);
  const reason = signal ? classificationReason(signal, dataset) : null;
  const checks = governanceChecks(asset, dataset);
  const { usage } = score;
  const series = dailySeries(dataset, asset.id);
  const evalSummary = evalResultsByAsset(dataset).get(asset.id);
  const owner = asset.ownerId
    ? dataset.owners.find((row) => row.id === asset.ownerId)
    : undefined;
  const origin = asset.originId
    ? dataset.origins.find((row) => row.id === asset.originId)
    : undefined;
  const { requires, requiredBy } = dependenciesOf(dataset, asset.id);
  const bundles = bundlesOf(dataset, asset.id);
  const assetTags = dataset.assetTags
    .filter((row) => row.assetId === asset.id)
    .map((row) => dataset.tags.find((tag) => tag.id === row.tagId))
    .filter((tag): tag is TagRow => Boolean(tag));
  const pillarTags = assetTags.filter((tag) => tag.kind === "pillar");
  const capabilityTags = assetTags.filter((tag) => tag.kind === "capability");
  const domainTags = assetTags.filter((tag) => tag.kind === "domain");

  const retired = asset.status === "retired";
  const statusPill = lifecyclePill(asset.status);
  const risk = riskPill(asset.riskLevel);
  const probeOnly = hasOnlyProbeTelemetry(
    asset.id,
    dataset.utilization,
    dataset.telemetryMeta,
  );
  const trendTone =
    usage.invocations === 0
      ? "text-subtle"
      : TREND_TONE_CLASS[successMeterTone(usage.successRate)];

  return (
    <div className="space-y-4">
      {/* Hero dossier header */}
      <header className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              className="eyebrow inline-flex items-center gap-1 text-accent-strong hover:underline"
              to="/catalogue"
            >
              <span aria-hidden="true">&larr;</span> Catalogue
            </Link>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">
              {asset.name}
            </p>
            <div className="mt-1 font-mono text-sm text-subtle">
              {asset.slug}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone="blue">{asset.type}</Pill>
              <Pill tone="slate">{asset.tier}</Pill>
              <Pill severity={statusPill.severity} tone={statusPill.tone}>
                {lifecycleOf(asset.status)}
              </Pill>
              {scopeOf(asset.status) && (
                <Pill tone={SCOPE_TONE[scopeOf(asset.status)!]}>
                  {scopeOf(asset.status)}
                </Pill>
              )}
              <Pill severity={risk.severity} tone={risk.tone}>
                {asset.riskLevel} risk
              </Pill>
              <span className="inline-flex items-center rounded-full bg-surface-inset px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-border">
                v{asset.version}
              </span>
            </div>
            {signal && <AssetStateBadges className="mt-2" signal={signal} />}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-medium text-accent-fg shadow-card transition-[background-color,transform,box-shadow] hover:bg-accent-strong-hover active:translate-y-px"
              to={`/catalogue?edit=${asset.id}`}
            >
              Edit asset
            </Link>
            {confirmRetire ? (
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Confirm retire asset"
                  disabled={retired}
                  onClick={() => void retireAsset(asset.id)}
                  variant="danger"
                >
                  Confirm retire
                </Button>
                <Button onClick={() => setConfirmRetire(false)} variant="ghost">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                disabled={retired}
                onClick={() => setConfirmRetire(true)}
                variant="ghost"
              >
                {retired ? "Retired" : "Retire asset"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {probeOnly && (
        <div
          className="flex items-start gap-2 rounded-xl border border-info/30 bg-info-surface px-4 py-3 text-sm text-info-fg shadow-card"
          role="note"
        >
          <span aria-hidden="true" className="mt-0.5 font-semibold">
            i
          </span>
          <p>
            Synthetic probe invocation, not live usage. The telemetry probe
            seeds one call so this asset resolves through the pipeline; the
            usage below is not real activity.
          </p>
        </div>
      )}

      {/* Scoring and usage */}
      <section className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Governed score">
            <div className="font-mono text-3xl font-semibold leading-none tabular-nums text-fg">
              {formatPercent(score.governedScore)}
            </div>
            <Meter
              className="mt-3"
              label="Governed score"
              showValue
              tone="accent"
              value={score.governedScore}
            />
            <div className="eyebrow mt-4">Governance checks</div>
            <GovernanceChecklist checks={checks} className="mt-2" />
          </Panel>
          <Panel title="Effective score">
            {probeOnly ? (
              <>
                <div className="font-mono text-3xl font-semibold leading-none tabular-nums text-subtle">
                  Synthetic
                </div>
                <p className="mt-3 text-xs text-subtle">
                  Probe-seeded: one synthetic call, not a measured score.
                </p>
              </>
            ) : (
              <>
                <div className="font-mono text-3xl font-semibold leading-none tabular-nums text-fg">
                  {score.effectiveScore === null
                    ? "Insufficient evidence"
                    : formatPercent(score.effectiveScore)}
                </div>
                {score.effectiveScore !== null && (
                  <Meter
                    className="mt-3"
                    label="Effective score"
                    showValue
                    tone="accent"
                    value={score.effectiveScore}
                  />
                )}
                {trend.direction !== "insufficient" && trend.delta !== null && (
                  <div className="mt-3 flex items-center gap-2">
                    <Pill
                      tone={
                        trend.direction === "regressing"
                          ? "red"
                          : trend.direction === "improving"
                            ? "green"
                            : "slate"
                      }
                    >
                      {trend.direction}
                    </Pill>
                    <span className="font-mono text-xs tabular-nums text-subtle">
                      {formatPercent(trend.prior?.assetEffectivenessScore ?? 0)}{" "}
                      to{" "}
                      {formatPercent(
                        trend.recent?.assetEffectivenessScore ?? 0,
                      )}{" "}
                      ({trend.delta >= 0 ? "+" : ""}
                      {Math.round(trend.delta * 100)}% vs prior window)
                    </span>
                  </div>
                )}
              </>
            )}
          </Panel>
          <Panel title="Quadrant">
            <div className="flex flex-wrap items-center gap-2">
              {signal ? (
                <AssetStateBadges signal={signal} />
              ) : (
                <Pill tone="slate">{score.quadrant}</Pill>
              )}
              <Pill tone="slate">confidence: {score.confidence}</Pill>
              <Pill
                severity={HONESTY_SEVERITY[honesty]}
                tone={HONESTY_TONE[honesty]}
              >
                {`measurement: ${honesty}`}
              </Pill>
            </div>
            <ul className="mt-2 text-xs text-subtle">
              {(() => {
                const presentWeightSum = score.signals
                  .filter((s) => s.present)
                  .reduce((sum, s) => sum + s.weight, 0);
                return score.signals.map((sig) => (
                  <li key={sig.id}>
                    {sig.id}:{" "}
                    {sig.present ? (
                      <>
                        <span className="font-mono tabular-nums">
                          {formatPercent(sig.value)}
                        </span>{" "}
                        (contribution{" "}
                        <span className="font-mono tabular-nums">
                          {presentWeightSum > 0
                            ? formatPercent(sig.weight / presentWeightSum)
                            : "0%"}
                        </span>
                        )
                      </>
                    ) : (
                      "not measured"
                    )}
                  </li>
                ));
              })()}
            </ul>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted">
                  Governed {score.governed ? "yes" : "no"}, effective{" "}
                  {score.effective ? "yes" : "no"}.
                </p>
                {reason && <p className="mt-1 text-xs text-subtle">{reason}</p>}
              </div>
              <Sparkline
                className={trendTone}
                fill
                height={28}
                label={`${asset.name} usage trend`}
                series={series}
                width={96}
              />
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Invocations"
            value={formatNumber(usage.invocations)}
          />
          <KpiCard
            label="Success rate"
            tone={
              usage.invocations === 0 || probeOnly
                ? "neutral"
                : successKpiTone(usage.successRate)
            }
            value={formatPercent(usage.successRate)}
          />
          <KpiCard
            label="Errors"
            tone={usage.errors > 0 ? "warn" : "neutral"}
            value={formatNumber(usage.errors)}
          />
          <KpiCard
            detail={formatCurrency(usage.cost)}
            label="Avg latency"
            value={`${formatNumber(usage.latencyMs)} ms`}
          />
        </div>
      </section>

      {/* Eval evidence (only when this asset has private-eval results) */}
      {evalSummary && (
        <Panel
          action={
            <Pill
              severity={HONESTY_SEVERITY[evalSummary.quality]}
              tone={HONESTY_TONE[evalSummary.quality]}
            >
              {`quality: ${evalSummary.quality}`}
            </Pill>
          }
          title="Eval evidence"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="font-mono text-3xl font-semibold leading-none tabular-nums text-fg">
                {formatPercent(evalPassRate(evalSummary))}
              </div>
              <Meter
                className="mt-3"
                label="Eval pass rate"
                showValue
                tone="accent"
                value={evalPassRate(evalSummary)}
              />
              <p className="mt-3 text-xs text-subtle">
                Private evals gate confidence, not the effectiveness estimate. A
                lower-fidelity eval caps the measurement grade above; it never
                moves the effective score.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2">
              <KpiCard
                label="Trials"
                value={formatNumber(evalSummary.trials)}
              />
              <KpiCard
                label="Passed"
                tone="good"
                value={formatNumber(evalSummary.passed)}
              />
              <KpiCard
                label="Failed"
                tone={evalSummary.failed > 0 ? "warn" : "neutral"}
                value={formatNumber(evalSummary.failed)}
              />
              <KpiCard
                label="Errored"
                tone={evalSummary.errored > 0 ? "risk" : "neutral"}
                value={formatNumber(evalSummary.errored)}
              />
            </div>
          </div>
        </Panel>
      )}

      {/* Metadata */}
      <Panel title="Metadata">
        <div className="space-y-4">
          {asset.description && (
            <p className="text-sm leading-relaxed text-muted">
              {asset.description}
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetaItem label="Owner">
              {owner ? `${owner.name} (${owner.role})` : "Unassigned"}
            </MetaItem>
            <MetaItem label="Origin">
              {origin ? (
                origin.url ? (
                  <a
                    className="text-accent-strong hover:underline"
                    href={origin.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {origin.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  origin.name
                )
              ) : (
                "Unknown"
              )}
            </MetaItem>
            <MetaItem label="Maturity" mono>
              {formatPercent(asset.maturity)}
            </MetaItem>
            <MetaItem label="Created" mono>
              {formatDate(asset.createdAt)}
            </MetaItem>
            <MetaItem label="Updated" mono>
              {formatDate(asset.updatedAt)}
            </MetaItem>
            {asset.tier === "forked" && (
              <MetaItem label="Forked from" mono>
                {asset.stockVersion ?? "unknown"}
              </MetaItem>
            )}
            <MetaItem
              className="sm:col-span-2 lg:col-span-3"
              label="Content hash"
              mono
            >
              <span className="break-all text-xs text-muted">
                {asset.contentHash}
              </span>
            </MetaItem>
          </dl>
        </div>
      </Panel>

      {/* Tags */}
      <Panel title="Tags">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TagGroup label="Pillars" tags={pillarTags} tone="blue" />
          <TagGroup label="Capabilities" tags={capabilityTags} tone="slate" />
          <TagGroup label="Domains" tags={domainTags} tone="green" />
        </div>
      </Panel>

      {/* Relationships */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          action={
            <span className="eyebrow font-mono tabular-nums">
              {requires.length}
            </span>
          }
          title="Requires"
        >
          {requires.length ? (
            <ul className="space-y-2">
              {requires.map((dep) => (
                <li key={dep.id}>
                  <RelationLink asset={dep} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No dependencies.</EmptyState>
          )}
        </Panel>
        <Panel
          action={
            <span className="eyebrow font-mono tabular-nums">
              {requiredBy.length}
            </span>
          }
          title="Required by"
        >
          {requiredBy.length ? (
            <ul className="space-y-2">
              {requiredBy.map((dep) => (
                <li key={dep.id}>
                  <RelationLink asset={dep} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing depends on this asset.</EmptyState>
          )}
        </Panel>
        <Panel
          action={
            <span className="eyebrow font-mono tabular-nums">
              {bundles.length}
            </span>
          }
          title="Bundles"
        >
          {bundles.length ? (
            <ul className="space-y-2">
              {bundles.map((bundle) => (
                <li
                  key={bundle.id}
                  className="rounded-lg border border-border bg-surface p-3 shadow-card"
                >
                  <div className="text-sm font-medium text-fg">
                    {bundle.name}
                  </div>
                  {bundle.description && (
                    <div className="mt-0.5 text-xs text-subtle">
                      {bundle.description}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Not part of any bundle.</EmptyState>
          )}
        </Panel>
      </div>

      {/* Related assets */}
      <Panel
        action={
          <span className="eyebrow font-mono tabular-nums">
            {relatedAssets.length}
          </span>
        }
        title="Related assets"
      >
        {relatedAssets.length ? (
          <div className="space-y-3">
            <SearchInput
              label="Search related assets"
              onChange={setRelatedQuery}
              placeholder="Search by name, slug, type, or reason"
              resultCount={{
                matched: filteredRelatedAssets.length,
                total: relatedAssets.length,
                noun: "related assets",
              }}
              value={relatedQuery}
            />
            {filteredRelatedAssets.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRelatedAssets.map((item) => (
                  <li className="min-w-0" key={item.asset.id}>
                    <RelatedAssetRow item={item} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                No related assets match &quot;{relatedQuery.trim()}&quot;.
              </EmptyState>
            )}
          </div>
        ) : (
          <EmptyState>No related assets yet.</EmptyState>
        )}
      </Panel>

      {/* Asset body */}
      <Panel title="Asset body">
        <pre
          aria-label="Asset body"
          className="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-inset p-3.5 font-mono text-xs leading-relaxed text-fg"
          role="region"
          tabIndex={0}
        >
          {asset.body}
        </pre>
      </Panel>
    </div>
  );
}
