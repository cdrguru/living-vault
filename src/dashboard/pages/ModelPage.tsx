import { useEffect, useRef, useState } from "react";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { DUR, EASE } from "@/motion/tokens";
import { prefersReduced } from "@/motion/useReducedMotion";
import { Button } from "@/dashboard/components/Button";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { utilizationDates } from "@/data/metrics";
import { useVault } from "@/dashboard/VaultContext";
import { CanvasViewport } from "@/dashboard/model/CanvasViewport";
import {
  ExplorerPanel,
  type ModelSelection,
} from "@/dashboard/model/ExplorerPanel";
import {
  RELATIONSHIP_LIST,
  TABLES,
  visibleTables,
  type LayoutMode,
  type RelationshipId,
  type TableId,
} from "@/dashboard/model/modelMeta";
import { findSearchTarget } from "@/dashboard/model/search";
import { LegendCard } from "@/dashboard/model/LegendCard";
import { useCanvas } from "@/dashboard/model/useCanvas";

/** Width of the explorer panel (w-80) so glides land in the visible canvas. */
const PANEL_WIDTH = 320;

/** The relationship key is the legend for reading the diagram, so it opens once
 * on the first visit and stays dismissed after, the same one-time pattern as the
 * command-palette hint. */
const LEGEND_SEEN_KEY = "living-vault:model-legend-seen";

function readLegendSeen() {
  try {
    return Boolean(localStorage.getItem(LEGEND_SEEN_KEY));
  } catch {
    return false;
  }
}

function markLegendSeen() {
  try {
    localStorage.setItem(LEGEND_SEEN_KEY, "1");
  } catch {
    /* storage unavailable, in-memory open still works for this visit */
  }
}

/** The canvas gestures (pan, zoom, click to inspect) are not self-evident, so a
 * one-time coachmark names them on the first visit, dismissed thereafter. */
const COACH_SEEN_KEY = "living-vault:model-coach-seen";

function readCoachSeen() {
  try {
    return Boolean(localStorage.getItem(COACH_SEEN_KEY));
  } catch {
    return false;
  }
}

function markCoachSeen() {
  try {
    localStorage.setItem(COACH_SEEN_KEY, "1");
  } catch {
    /* storage unavailable, in-memory dismissal still works for this visit */
  }
}

export function ModelPage() {
  const { dataset } = useVault();
  const [mode, setMode] = useState<LayoutMode>("collapsed");
  const [selection, setSelection] = useState<ModelSelection>(null);
  const [hoveredTable, setHoveredTable] = useState<TableId | null>(null);
  const [legendOpen, setLegendOpen] = useState(() => !readLegendSeen());
  const [health, setHealth] = useState(false);
  const [coachOpen, setCoachOpen] = useState(() => !readCoachSeen());
  const [search, setSearch] = useState("");
  const [cutoff, setCutoff] = useState<number | null>(null);
  const canvas = useCanvas(mode);
  const canvasScope = useRef<HTMLDivElement>(null);

  // Mark the legend and coachmark seen on first mount so each surfaces only on
  // the first ever visit; the user can still toggle the legend any time after.
  useEffect(() => {
    markLegendSeen();
    markCoachSeen();
  }, []);

  const dismissCoach = () => {
    setCoachOpen(false);
    markCoachSeen();
  };

  const selectedTableId = selection?.kind === "table" ? selection.id : null;

  // One-shot focus pulse on the selected node card. Transform only, never a
  // box-shadow loop and never an opacity dip, so the card stays fully visible
  // and keeps focus while it pulses. Scoped to the canvas wrapper so the revert
  // never touches the page chrome, and it clears its own inline props on
  // complete so it leaves no residue. Under reduced motion the card stays
  // static; the persistent accent ring still marks the selection.
  useGSAP(
    () => {
      if (!selectedTableId || prefersReduced()) return;
      const card = canvasScope.current?.querySelector(
        `[data-table-id="${selectedTableId}"]`,
      );
      if (!card) return;
      // A single settle-in pop: start slightly enlarged and ease back to rest.
      // One direction means the tween ends at the natural scale with no residual
      // transform, so it never lingers on the focused card.
      gsap.fromTo(
        card,
        { scale: 1.06 },
        {
          scale: 1,
          duration: DUR.sm,
          ease: EASE.out,
          transformOrigin: "center center",
          clearProps: "scale,transform",
        },
      );
    },
    { dependencies: [selectedTableId], scope: canvasScope },
  );

  if (!dataset) return <div className="text-sm text-subtle">Loading...</div>;

  const glideTo = (id: TableId) => {
    const rect = canvas.rects[id];
    if (rect) {
      canvas.centerOn(
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        // Selecting a table opens the explorer panel (w-80, 320px), so glide the
        // node into the visible canvas rather than behind the panel.
        { animate: true, insetRight: PANEL_WIDTH },
      );
    }
  };

  const selectTable = (id: TableId | null) => {
    setSelection(id ? { kind: "table", id } : null);
    if (id) glideTo(id);
  };
  const selectRelationship = (id: RelationshipId) =>
    setSelection({ kind: "relationship", id });

  const flyToSearch = () => {
    const target = findSearchTarget(search, dataset, visibleTables(mode));
    if (target) {
      setSelection({ kind: "table", id: target });
      glideTo(target);
    }
  };

  const dates = utilizationDates(dataset);
  const maxIndex = dates.length - 1;
  const cutoffIndex = cutoff === null ? maxIndex : Math.min(cutoff, maxIndex);
  const scrubbing = dates.length > 1 && cutoffIndex < maxIndex;
  const timeWindow = scrubbing
    ? { start: dates[0], end: dates[cutoffIndex] }
    : undefined;

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setSelection(null);
          setLegendOpen(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Find and view controls cluster on the left. */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Search the canvas"
            className="rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-accent"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                flyToSearch();
              }
            }}
            placeholder="Find a table or asset"
            type="search"
            value={search}
          />
          <button
            aria-checked={mode === "expanded"}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-inset"
            onClick={() => {
              setMode((current) =>
                current === "collapsed" ? "expanded" : "collapsed",
              );
              setSelection(null);
            }}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={`relative h-4 w-7 rounded-full transition-colors ${
                mode === "expanded" ? "bg-accent" : "bg-border-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface-raised transition-transform ${
                  mode === "expanded" ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
            Show join tables
          </button>
          <button
            aria-checked={health}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-inset"
            onClick={() => setHealth((on) => !on)}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={`relative h-4 w-7 rounded-full transition-colors ${
                health ? "bg-accent" : "bg-border-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface-raised transition-transform ${
                  health ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
            Health view
          </button>
          <div className="relative">
            <Button
              aria-controls="model-legend"
              aria-expanded={legendOpen}
              aria-label="Legend"
              onClick={() => setLegendOpen((open) => !open)}
              size="sm"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
              </svg>
              Legend
            </Button>
            {legendOpen && (
              <div className="absolute left-0 top-full z-20 mt-1">
                <LegendCard id="model-legend" />
              </div>
            )}
          </div>
        </div>
        {/* Canvas actions sit apart on the right; Fit lives in the zoom pill. */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button onClick={canvas.reset} size="sm">
            Reset layout
          </Button>
          <InfoTooltip label={TOOLTIPS["model.canvas"]} triggerLabel="About the data model" />
        </div>
      </div>

      {dates.length > 1 && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <label className="font-medium text-subtle" htmlFor="model-time-scrub">
            Asset health
          </label>
          <input
            aria-label="Scrub the utilization window"
            className="h-1 grow accent-accent"
            id="model-time-scrub"
            max={maxIndex}
            min={0}
            onChange={(event) => setCutoff(Number(event.target.value))}
            type="range"
            value={cutoffIndex}
          />
          <span className="w-44 shrink-0 tabular-nums">
            {scrubbing
              ? `${dates[0]} to ${dates[cutoffIndex]}`
              : `Full window through ${dates[maxIndex]}`}
          </span>
          {scrubbing && (
            <Button onClick={() => setCutoff(null)} size="sm" variant="ghost">
              Full
            </Button>
          )}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-3 shadow-card md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-fg">
              Model tables
            </h2>
            <p className="mt-1 text-xs text-subtle">
              Map view remains available below for spatial context.
            </p>
          </div>
          <span className="eyebrow">{visibleTables(mode).length} shown</span>
        </div>
        <ul aria-label="Model tables" className="mt-3 space-y-2">
          {visibleTables(mode).map((id) => {
            const meta = TABLES[id];
            return (
              <li
                className="rounded-lg border border-border bg-surface-raised p-3"
                key={id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-fg">{meta.id}</span>
                  <span className="font-mono text-sm tabular-nums text-muted">
                    {meta.count(dataset)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted">
                  {meta.groups.map((section) => (
                    <div key={section.label}>
                      <span className="eyebrow">{section.label}</span>
                      <span className="ml-2">{section.fields.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div
        className="relative h-[calc(100vh-16rem)] min-h-[480px] overflow-hidden rounded-lg border border-border bg-surface-muted"
        ref={canvasScope}
      >
        <CanvasViewport
          canvas={canvas}
          dataset={dataset}
          health={health}
          hoveredTable={hoveredTable}
          mode={mode}
          onHoverTable={setHoveredTable}
          onSelectRelationship={selectRelationship}
          onSelectTable={selectTable}
          selectedRelationship={
            selection?.kind === "relationship" ? selection.id : null
          }
          selectedTable={selection?.kind === "table" ? selection.id : null}
          window={timeWindow}
        />
        {coachOpen && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface-raised/95 px-3 py-1.5 text-xs text-muted shadow-md backdrop-blur">
              <span>
                Drag to pan · scroll or pinch to zoom · click a table to inspect
              </span>
              <Button onClick={dismissCoach} size="sm" variant="ghost">
                Got it
              </Button>
            </div>
          </div>
        )}
        <ExplorerPanel
          dataset={dataset}
          onClose={() => setSelection(null)}
          onSelectRelationship={selectRelationship}
          selection={selection}
        />
      </div>

      <ul className="sr-only">
        {RELATIONSHIP_LIST.map((rel) => (
          <li key={rel.id}>{rel.explanation}</li>
        ))}
      </ul>
    </div>
  );
}
