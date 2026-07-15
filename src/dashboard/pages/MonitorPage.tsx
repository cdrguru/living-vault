import { useMemo, useState, type CSSProperties } from "react";

import { runDataSourceContract } from "@/data/contract";
import { utilizationByAssetWindowed } from "@/data/metrics";
import { Button } from "@/dashboard/components/Button";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { useVault } from "@/dashboard/VaultContext";
import {
  datasetHasOnlyProbe,
  readEnvInput,
  telemetryBanner,
} from "@/dashboard/settings/environment";

import { DataHealthBadge } from "@/dashboard/monitor/DataHealthBadge";
import {
  exceptionQueue,
  type ExceptionKind,
} from "@/dashboard/monitor/exceptionQueue";
import { healthTiles, type TileId } from "@/dashboard/monitor/healthStrip";
import { LensToolbar } from "@/dashboard/monitor/LensToolbar";
import { type LensId } from "@/dashboard/monitor/lenses";
import { MonitorCanvas } from "@/dashboard/monitor/MonitorCanvas";
import { MonitorFilterBar } from "@/dashboard/monitor/MonitorFilterBar";
import {
  defaultMonitorFilters,
  filterExceptions,
  matchingNodeIds,
  type MonitorFilters,
  type MonitorIndex,
  type MonitorView,
} from "@/dashboard/monitor/monitorFilters";
import { MonitorInspector } from "@/dashboard/monitor/MonitorInspector";
import { monitorEdges, monitorNodes } from "@/dashboard/monitor/monitorMeta";
import { HarnessSummaryStrip } from "@/dashboard/monitor/HarnessSummaryStrip";
import { HarnessUsagePanel } from "@/dashboard/monitor/HarnessUsagePanel";
import { OrphanedUsagePanel } from "@/dashboard/monitor/OrphanedUsagePanel";
import { neighborhood } from "@/dashboard/monitor/subgraph";
import { ToneGlyph } from "@/dashboard/monitor/ToneGlyph";
import { useTriage, type TriageEntry } from "@/dashboard/monitor/triageStore";
import { useMonitorCanvas } from "@/dashboard/monitor/useMonitorCanvas";

const rise = (ms: number): CSSProperties =>
  ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

const ACTION_CLASS =
  "rounded border border-border-strong px-2 py-0.5 text-xs text-fg hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-accent";

// The anchor id on the full harness panel at the bottom, targeted by the compact
// summary strip's "View details" link so it scrolls the detailed panel into view.
const HARNESS_PANEL_ID = "harness-usage-detail";

const triageLabel = (entry?: TriageEntry): string => {
  if (!entry) return "Active";
  if (entry.status === "snoozed") return "Snoozed";
  if (entry.status === "acknowledged") return "Acknowledged";
  return "Dismissed";
};

const TONE_TEXT = {
  success: "text-success",
  danger: "text-danger",
  warn: "text-warning",
  muted: "text-muted",
  neutral: "text-fg",
} as const;

const TILE_SURFACE = {
  success: "border-success/30 bg-success-surface text-success-fg",
  danger: "border-danger/30 bg-danger-surface text-danger-fg",
  warn: "border-warning/30 bg-warning-surface text-warning-fg",
  muted: "border-border bg-surface text-fg",
  neutral: "border-border bg-surface text-fg",
} as const;

const KIND_GLYPH: Record<ExceptionKind, string> = {
  risk: "alert",
  shelfware: "flag",
  "dead-weight": "dot",
  stale: "flag",
};

const KIND_TEXT: Record<ExceptionKind, string> = {
  risk: "text-danger",
  shelfware: "text-warning",
  "dead-weight": "text-muted",
  stale: "text-warning",
};

// The tiles that map cleanly to one filter dimension become quick-filters. The
// duplicates and violations tiles have no single matching dimension, so they stay
// as static counts (a deliberate declutter; the Coverage page explains duplicates).
const TILE_FILTER: Partial<Record<TileId, Partial<MonitorFilters>>> = {
  "effective-rate": { health: "Stars" },
  stars: { health: "Stars" },
  risks: { health: "Risks" },
  shelfware: { health: "Shelfware" },
  "dead-weight": { health: "Dead weight" },
  stale: { issue: "stale" },
};

export function MonitorPage() {
  const { dataset, loading, timeRange } = useVault();
  const [lens, setLens] = useState<LensId>("health");
  const [showTagged, setShowTagged] = useState(false);
  const [filters, setFilters] = useState<MonitorFilters>(defaultMonitorFilters);
  const [view, setView] = useState<MonitorView>("actionable");
  const [isolate, setIsolate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const triage = useTriage();

  const nodes = useMemo(() => (dataset ? monitorNodes(dataset) : []), [dataset]);
  const edges = useMemo(() => (dataset ? monitorEdges(dataset) : []), [dataset]);
  const usageByAsset = useMemo(
    () =>
      dataset
        ? utilizationByAssetWindowed(dataset, timeRange ?? undefined)
        : new Map(),
    [dataset, timeRange],
  );
  const queue = useMemo(
    () => (dataset ? exceptionQueue(dataset) : []),
    [dataset],
  );
  const violations = useMemo(
    () => (dataset ? runDataSourceContract(dataset) : []),
    [dataset],
  );
  const tiles = useMemo(
    () => (dataset ? healthTiles(dataset, violations.length) : []),
    [dataset, violations.length],
  );

  const index = useMemo<MonitorIndex>(() => {
    const map: MonitorIndex = new Map();
    if (!dataset) return map;
    const domainTagIds = new Set(
      dataset.tags
        .filter((tag) => tag.kind === "domain" || tag.kind === "pillar")
        .map((tag) => tag.id),
    );
    for (const asset of dataset.assets) {
      map.set(asset.id, { bundleIds: new Set(), domainTagIds: new Set() });
    }
    for (const membership of dataset.bundleMemberships) {
      map.get(membership.assetId)?.bundleIds.add(membership.bundleId);
    }
    for (const assetTag of dataset.assetTags) {
      if (domainTagIds.has(assetTag.tagId)) {
        map.get(assetTag.assetId)?.domainTagIds.add(assetTag.tagId);
      }
    }
    return map;
  }, [dataset]);

  const bundles = useMemo(
    () =>
      dataset
        ? dataset.bundles.map((bundle) => ({ id: bundle.id, name: bundle.name }))
        : [],
    [dataset],
  );
  const domains = useMemo(
    () =>
      dataset
        ? dataset.tags
            .filter((tag) => tag.kind === "domain" || tag.kind === "pillar")
            .map((tag) => ({ id: tag.id, name: tag.name }))
        : [],
    [dataset],
  );

  const issueByAsset = useMemo(() => {
    const map = new Map<string, ExceptionKind>();
    for (const row of queue) map.set(row.assetId, row.kind);
    return map;
  }, [queue]);

  const visibleEdges = useMemo(
    () => edges.filter((edge) => (edge.kind === "tagged" ? showTagged : true)),
    [edges, showTagged],
  );

  const displayedQueue = useMemo(
    () => filterExceptions(queue, filters, triage.state, view, new Date(), index),
    [queue, filters, triage.state, view, index],
  );
  const filterMatch = useMemo(
    () => matchingNodeIds(nodes, filters, issueByAsset, index),
    [nodes, filters, issueByAsset, index],
  );
  const focusIds = useMemo(
    () => (selectedId ? neighborhood(selectedId, visibleEdges) : null),
    [selectedId, visibleEdges],
  );

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const canvas = useMonitorCanvas(nodeIds);

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  if (dataset.assets.length === 0) {
    return (
      <EmptyState fill title="No assets to monitor yet">
        No assets in the Vault yet. Add assets from the Catalogue to populate
        the monitor.
      </EmptyState>
    );
  }

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;

  const tilePressed = (id: TileId): boolean => {
    const mapped = TILE_FILTER[id];
    if (!mapped) return false;
    if (mapped.health) return filters.health === mapped.health;
    if (mapped.issue) return filters.issue === mapped.issue;
    return false;
  };

  const toggleTile = (id: TileId) => {
    const mapped = TILE_FILTER[id];
    if (!mapped) return;
    const pressed = tilePressed(id);
    if (mapped.health) {
      setFilters({ ...filters, health: pressed ? "all" : mapped.health });
    } else if (mapped.issue) {
      setFilters({ ...filters, issue: pressed ? "all" : mapped.issue });
    }
  };

  const selectRow = (assetId: string) => {
    setSelectedId(assetId);
    canvas.centerOnNode(assetId);
  };

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelectedId(null);
      }}
    >
      {/* Region 1: freshness-first header band plus the data-health badge. */}
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-card"
        data-rise
        style={rise(0)}
      >
        <div className="text-sm">
          {dataset.telemetryMeta ? (
            <p className="text-subtle">
              Telemetry: {dataset.telemetryMeta.sessions} sessions, through{" "}
              {dataset.telemetryMeta.windowEnd} (
              {(["invocations", "successes", "errors", "latency"] as const)
                .filter((k) => dataset.telemetryMeta!.tracked[k])
                .join(", ") || "nothing measured"}
              ).
            </p>
          ) : (
            <p className="text-subtle">
              {telemetryBanner(
                readEnvInput(),
                dataset,
                datasetHasOnlyProbe(dataset),
              ).text}
            </p>
          )}
          {(dataset.telemetryMeta?.probeAssetIds?.length ?? 0) > 0 && (
            <p className="mt-0.5 text-subtle">
              {`${dataset.telemetryMeta?.probeAssetIds?.length} assets probe-seeded on ${dataset.telemetryMeta?.probeDate}.`}
            </p>
          )}
        </div>
        <DataHealthBadge dataset={dataset} />
      </section>

      {/* Region 1b: compact above-the-fold harness summary, links to the full
          panel at the bottom so harness telemetry is discoverable up top. */}
      <div data-rise style={rise(40)}>
        <HarnessSummaryStrip detailsHref={HARNESS_PANEL_ID} />
      </div>

      {/* Region 2: the filter toolbar drives both the queue and the canvas. */}
      <div data-rise style={rise(60)}>
        <MonitorFilterBar
          bundles={bundles}
          domains={domains}
          filters={filters}
          onFilters={setFilters}
          onView={setView}
          view={view}
        />
      </div>

      {/* Region 3: health strip. Mappable tiles cross-filter; the rest are counts. */}
      <div className="space-y-2" data-rise style={rise(120)}>
        <div className="flex items-center gap-1.5">
          <span className="eyebrow">Health</span>
          <InfoTooltip
            label={TOOLTIPS["monitor.healthTiles"]}
            triggerLabel="About the health tiles"
          />
        </div>
        <section
          aria-label="Health strip"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8"
        >
          {tiles.map((tile) => {
            const interactive = Boolean(TILE_FILTER[tile.id]);
            const pressed = tilePressed(tile.id);
            const body = (
              <>
                <span className="flex items-center gap-1.5">
                  {tile.tone !== "neutral" && (
                    <ToneGlyph
                      className={TONE_TEXT[tile.tone]}
                      glyph={
                        tile.tone === "success"
                          ? "star"
                          : tile.tone === "danger"
                            ? "alert"
                            : tile.tone === "warn"
                              ? "flag"
                              : "dot"
                      }
                    />
                  )}
                  <span className="eyebrow">{tile.label}</span>
                </span>
                <span className="mt-1 block font-mono text-xl font-semibold tabular-nums">
                  {tile.value}
                </span>
                {tile.detail && (
                  <span className="text-xs text-subtle">{tile.detail}</span>
                )}
              </>
            );
            const surface = [
              "rounded-xl border p-3 text-left shadow-card",
              TILE_SURFACE[tile.tone],
            ];
            if (!interactive) {
              return (
                <div className={surface.join(" ")} key={tile.id}>
                  {body}
                </div>
              );
            }
            return (
              <button
                aria-pressed={pressed}
                className={[
                  ...surface,
                  "transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  pressed ? "ring-2 ring-accent" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={tile.id}
                onClick={() => toggleTile(tile.id)}
                type="button"
              >
                {body}
              </button>
            );
          })}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Region 4: filtered, actionable-by-default exception queue with triage. */}
        <section
          aria-label="Exception queue"
          className="flex max-h-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card"
          data-rise
          data-tour="exception-queue"
          style={rise(160)}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-sm font-semibold tracking-tight text-fg">
                Exception queue
              </h2>
              <InfoTooltip
                label={TOOLTIPS["monitor.exceptionQueue"]}
                triggerLabel="About the exception queue"
              />
            </div>
            <span className="eyebrow">{displayedQueue.length} items</span>
          </header>
          {displayedQueue.length === 0 ? (
            <div className="space-y-2 p-4">
              <EmptyState>All clear. No exceptions match this view.</EmptyState>
              {view === "actionable" && (
                <button
                  className="text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => setView("all")}
                  type="button"
                >
                  Show all exceptions
                </button>
              )}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {displayedQueue.map((row) => (
                <li
                  className={selectedId === row.assetId ? "bg-surface-inset" : ""}
                  key={row.assetId}
                >
                  <div className="flex flex-col gap-1.5 px-4 py-3">
                    <button
                      className="flex w-full flex-col gap-1 text-left focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => selectRow(row.assetId)}
                      type="button"
                    >
                      <span className="flex items-center gap-1.5">
                        <ToneGlyph
                          className={KIND_TEXT[row.kind]}
                          glyph={KIND_GLYPH[row.kind]}
                        />
                        <span className="truncate text-sm font-semibold text-fg">
                          {row.name}
                        </span>
                        <span
                          className={`ml-auto text-xs font-medium ${KIND_TEXT[row.kind]}`}
                        >
                          {row.label}
                        </span>
                      </span>
                      <span className="text-xs text-subtle">{row.reason}</span>
                    </button>
                    {view === "actionable" ? (
                      <div className="flex items-center gap-2">
                        <button
                          className={ACTION_CLASS}
                          onClick={() => triage.acknowledge(row.assetId)}
                          type="button"
                        >
                          Acknowledge
                        </button>
                        <button
                          className={ACTION_CLASS}
                          onClick={() => triage.snooze(row.assetId, 7)}
                          type="button"
                        >
                          Snooze 7d
                        </button>
                        <button
                          className={ACTION_CLASS}
                          onClick={() => triage.dismiss(row.assetId)}
                          type="button"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-subtle">
                        <span>{triageLabel(triage.state[row.assetId])}</span>
                        {triage.state[row.assetId] && (
                          <button
                            className={ACTION_CLASS}
                            onClick={() => triage.restore(row.assetId)}
                            type="button"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The asset-topology canvas with the lens toolbar and inspector. */}
        <section className="space-y-3" data-rise style={rise(160)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <LensToolbar active={lens} onChange={setLens} />
              <InfoTooltip
                label={TOOLTIPS["monitor.canvas"]}
                triggerLabel="About the asset map"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-pressed={isolate}
                className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedId}
                onClick={() => setIsolate((value) => !value)}
                type="button"
              >
                {isolate ? "Show all" : "Isolate"}
              </button>
              <button
                aria-checked={showTagged}
                className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setShowTagged((value) => !value)}
                role="switch"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`relative h-4 w-7 rounded-full transition-colors ${
                    showTagged ? "bg-accent" : "bg-border-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface-raised transition-transform ${
                      showTagged ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
                Show all links
              </button>
              <Button onClick={canvas.reset} size="sm">
                Reset layout
              </Button>
            </div>
          </div>

          <p className="text-xs text-subtle">
            Structural links (requires, duplicate) show by default. Select an
            exception or node to focus its full neighborhood, or Show all links
            to reveal every bundle and tag relationship; Isolate hides the rest.
          </p>

          <div className="relative h-[calc(100vh-22rem)] min-h-[460px] overflow-hidden rounded-lg border border-border bg-surface-muted">
            <MonitorCanvas
              canvas={canvas}
              edges={edges}
              filterMatch={filterMatch}
              focusIds={focusIds}
              isolate={isolate}
              lens={lens}
              nodes={nodes}
              onSelectNode={setSelectedId}
              selectedId={selectedId}
              showTagged={showTagged}
              usageByAsset={usageByAsset}
            />
            {selectedNode && (
              <MonitorInspector
                dataset={dataset}
                node={selectedNode}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>

          {/* A screen-reader relationship list for the asset graph (WCAG keyboard path). */}
          <ul className="sr-only">
            {nodes.map((node) => (
              <li key={node.id}>
                {node.name}, {node.type}, {node.quadrant}. Required by{" "}
                {node.requiredByCount} assets.
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div data-rise style={rise(240)}>
        <OrphanedUsagePanel />
      </div>

      <div
        className="scroll-mt-4"
        data-rise
        id={HARNESS_PANEL_ID}
        style={rise(260)}
      >
        <HarnessUsagePanel />
      </div>
    </div>
  );
}
