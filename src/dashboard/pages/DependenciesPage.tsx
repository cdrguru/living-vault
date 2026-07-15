import { useMemo, useState } from "react";

import type { AssetStatus } from "@/data/types";
import { useVault } from "@/dashboard/VaultContext";
import { formatNumber } from "@/dashboard/format";
import { Button } from "@/dashboard/components/Button";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { KpiCard } from "@/dashboard/components/KpiCard";
import { PageHeader } from "@/dashboard/components/PageHeader";
import { SearchInput } from "@/dashboard/components/SearchInput";
import { Skeleton, SkeletonKpiRow } from "@/dashboard/components/Skeleton";
import { neighborhood } from "@/dashboard/monitor/subgraph";
import { TONE_CLASS } from "@/dashboard/monitor/toneClass";
import { ToneGlyph } from "@/dashboard/monitor/ToneGlyph";
import { TOOLTIPS } from "@/dashboard/tooltips";

import { DependencyCanvas } from "@/dashboard/dependencies/DependencyCanvas";
import { DependencyDetail } from "@/dashboard/dependencies/DependencyDetail";
import {
  DEPENDENCY_LEGEND,
  dependencyEdges,
  dependencyNodes,
} from "@/dashboard/dependencies/dependencyMeta";
import { useDependencyCanvas } from "@/dashboard/dependencies/useDependencyCanvas";

/** Statuses that make a requires edge fragile, so the target reads as a warning. */
const FRAGILE_STATUS = new Set<AssetStatus>(["deprecated", "retired"]);

export function DependenciesPage() {
  const { dataset, loading } = useVault();
  const [query, setQuery] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo(
    () => (dataset ? dependencyNodes(dataset) : []),
    [dataset],
  );
  const edges = useMemo(
    () => (dataset ? dependencyEdges(dataset) : []),
    [dataset],
  );

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const canvas = useDependencyCanvas(nodeIds);

  // Case-insensitive name or type match builds the filter set the canvas dims by.
  const needle = query.trim().toLowerCase();
  const filterMatch = useMemo(() => {
    if (!needle) return new Set(nodeIds);
    const has = (text: string) => text.toLowerCase().includes(needle);
    return new Set(
      nodes
        .filter((node) => has(node.name) || has(node.type))
        .map((node) => node.id),
    );
  }, [nodes, nodeIds, needle]);

  const focusIds = useMemo(
    () => (selectedId ? neighborhood(selectedId, edges) : null),
    [selectedId, edges],
  );

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow count={3} />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  // Fragile edges point at a deprecated or retired target, a break waiting to happen.
  const statusById = new Map(
    dataset.assets.map((asset) => [asset.id, asset.status]),
  );
  const fragileEdges = edges.filter((edge) => {
    const status = statusById.get(edge.to);
    return status !== undefined && FRAGILE_STATUS.has(status);
  }).length;

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const hasQuery = needle.length > 0;

  const selectNode = (id: string) => {
    setSelectedId(id);
    canvas.centerOnNode(id);
  };

  // Clearing the selection also turns Isolate off: Isolate only makes sense with
  // a focused node, and the toggle disables itself once nothing is selected, so
  // leaving it stuck "on" (showing "Show all") is misleading.
  const clearSelection = () => {
    setSelectedId(null);
    setIsolate(false);
  };

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") clearSelection();
      }}
    >
      <PageHeader
        kpiColumns={3}
        kpis={
          <>
            <KpiCard
              detail="Declared requires relationships drawn on the graph"
              info="dependencies.edges"
              label="Dependency edges"
              value={formatNumber(edges.length)}
            />
            <KpiCard
              detail="Point at a deprecated or retired asset"
              info="dependencies.fragileEdges"
              label="Fragile edges"
              tone={fragileEdges > 0 ? "warn" : "neutral"}
              value={formatNumber(fragileEdges)}
            />
            <KpiCard
              detail="Assets that participate in at least one edge"
              info="dependencies.graphedAssets"
              label="Graphed assets"
              value={formatNumber(nodes.length)}
            />
          </>
        }
        meta={
          <div className="flex items-center gap-2">
            <p aria-live="polite" className="text-xs text-subtle" role="status">
              {hasQuery
                ? `${formatNumber(filterMatch.size)} of ${formatNumber(
                    nodes.length,
                  )} assets match`
                : "Arrows point from a dependent asset to the asset it requires. Select a node to focus its neighborhood."}
            </p>
            <InfoTooltip
              label={TOOLTIPS["dependencies.graph"]}
              triggerLabel="About the dependency graph"
            />
          </div>
        }
        search={
          <SearchInput
            label="Search dependency graph by asset name or type"
            onChange={setQuery}
            placeholder="Filter by name"
            resultCount={{
              matched: filterMatch.size,
              total: nodes.length,
              noun: "assets",
            }}
            value={query}
          />
        }
        toolbar={
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
            <Button onClick={canvas.reset} size="sm">
              Reset layout
            </Button>
          </div>
        }
      />

      {edges.length === 0 ? (
        <EmptyState fill title="No dependency edges">
          No asset in the Vault declares a requires relationship yet. Bundles
          remain visible in the Monitor.
        </EmptyState>
      ) : (
        <>
          <div className="relative h-[calc(100vh-22rem)] min-h-[460px] overflow-hidden rounded-lg border border-border bg-surface-muted">
            <DependencyCanvas
              canvas={canvas}
              edges={edges}
              filterMatch={filterMatch}
              focusIds={focusIds}
              isolate={isolate}
              nodes={nodes}
              onSelectNode={(id) => (id ? selectNode(id) : clearSelection())}
              selectedId={selectedId}
            />
            {selectedNode && (
              <DependencyDetail
                dataset={dataset}
                node={selectedNode}
                onClose={clearSelection}
              />
            )}
          </div>
          {/* Legend: each node is colored by its operational quadrant, the same
              tones as the Monitor, so the graph reads at a glance. */}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-subtle">
            <li className="eyebrow text-subtle">node quadrant</li>
            {DEPENDENCY_LEGEND.map((entry) => {
              const tone = TONE_CLASS[entry.tone];
              return (
                <li className="flex items-center gap-1.5" key={entry.tone}>
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full ring-1 ${tone.surface} ${tone.ring} ${tone.text}`}
                  >
                    <ToneGlyph glyph={entry.glyph} className="h-2.5 w-2.5" />
                  </span>
                  <span>{entry.label}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* A screen-reader relationship list for the dependency graph, which is also
          the no-JS accessible fallback for the canvas. */}
      <ul className="sr-only">
        {nodes.map((node) => (
          <li key={node.id}>
            {node.name}, {node.type}, {node.quadrant}. Requires{" "}
            {node.requiresCount}, required by {node.requiredByCount}.
          </li>
        ))}
      </ul>
    </div>
  );
}
