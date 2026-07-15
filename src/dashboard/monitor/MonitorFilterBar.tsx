// src/dashboard/monitor/MonitorFilterBar.tsx
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { TOOLTIPS } from "@/dashboard/tooltips";
import type { Quadrant } from "@/data/metrics";
import type { AssetType } from "@/data/types";

import type { ExceptionKind } from "./exceptionQueue";
import {
  defaultMonitorFilters,
  type MonitorFilters,
  type MonitorView,
} from "./monitorFilters";

const HEALTH_OPTIONS: Quadrant[] = ["Stars", "Risks", "Shelfware", "Dead weight"];
const ISSUE_OPTIONS: ExceptionKind[] = ["risk", "shelfware", "stale"];
const TYPE_OPTIONS: AssetType[] = [
  "skill",
  "subagent",
  "prompt",
  "mcp-server",
  "hook",
  "command",
  "workflow",
];
const SEVERITY_OPTIONS = ["high", "medium", "low"] as const;

const SELECT_CLASS =
  "rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";

export function MonitorFilterBar({
  filters,
  view,
  onFilters,
  onView,
  bundles,
  domains,
}: {
  filters: MonitorFilters;
  view: MonitorView;
  onFilters: (next: MonitorFilters) => void;
  onView: (next: MonitorView) => void;
  bundles: { id: string; name: string }[];
  domains: { id: string; name: string }[];
}) {
  const bundleName = (id: string) => bundles.find((b) => b.id === id)?.name ?? id;
  const domainName = (id: string) => domains.find((d) => d.id === id)?.name ?? id;

  const bundleOrDomainValue =
    filters.bundle !== "all"
      ? `bundle:${filters.bundle}`
      : filters.domain !== "all"
        ? `domain:${filters.domain}`
        : "all";

  const onBundleOrDomain = (value: string) => {
    if (value.startsWith("bundle:")) {
      onFilters({ ...filters, bundle: value.slice(7), domain: "all" });
    } else if (value.startsWith("domain:")) {
      onFilters({ ...filters, domain: value.slice(7), bundle: "all" });
    } else {
      onFilters({ ...filters, bundle: "all", domain: "all" });
    }
  };

  const chips: { key: keyof MonitorFilters; label: string }[] = [];
  if (filters.health !== "all") chips.push({ key: "health", label: `Health: ${filters.health}` });
  if (filters.issue !== "all") chips.push({ key: "issue", label: `Issue: ${filters.issue}` });
  if (filters.type !== "all") chips.push({ key: "type", label: `Type: ${filters.type}` });
  if (filters.severity !== "all") chips.push({ key: "severity", label: `Severity: ${filters.severity}` });
  if (filters.bundle !== "all") chips.push({ key: "bundle", label: `Bundle: ${bundleName(filters.bundle)}` });
  if (filters.domain !== "all") chips.push({ key: "domain", label: `Domain: ${domainName(filters.domain)}` });

  const removeChip = (key: keyof MonitorFilters) =>
    onFilters({ ...filters, [key]: "all" });

  return (
    <section
      aria-label="Monitor filters"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-card"
    >
      <div className="mr-1 flex items-center gap-1.5">
        <span className="eyebrow">Filters</span>
        <InfoTooltip label={TOOLTIPS["monitor.filters"]} triggerLabel="About the filters" />
      </div>

      <label className="sr-only" htmlFor="filter-health">Health class</label>
      <select
        className={SELECT_CLASS}
        id="filter-health"
        onChange={(event) =>
          onFilters({ ...filters, health: event.target.value as MonitorFilters["health"] })
        }
        value={filters.health}
      >
        <option value="all">Health: all</option>
        {HEALTH_OPTIONS.map((q) => (
          <option key={q} value={q}>{q}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-issue">Issue type</label>
      <select
        className={SELECT_CLASS}
        id="filter-issue"
        onChange={(event) =>
          onFilters({ ...filters, issue: event.target.value as MonitorFilters["issue"] })
        }
        value={filters.issue}
      >
        <option value="all">Issue: all</option>
        {ISSUE_OPTIONS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-type">Asset type</label>
      <select
        className={SELECT_CLASS}
        id="filter-type"
        onChange={(event) =>
          onFilters({ ...filters, type: event.target.value as MonitorFilters["type"] })
        }
        value={filters.type}
      >
        <option value="all">Type: all</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-scope">Bundle or domain</label>
      <select
        className={SELECT_CLASS}
        id="filter-scope"
        onChange={(event) => onBundleOrDomain(event.target.value)}
        value={bundleOrDomainValue}
      >
        <option value="all">Bundle or domain: all</option>
        {bundles.length > 0 && (
          <optgroup label="Bundles">
            {bundles.map((b) => (
              <option key={b.id} value={`bundle:${b.id}`}>{b.name}</option>
            ))}
          </optgroup>
        )}
        {domains.length > 0 && (
          <optgroup label="Domains">
            {domains.map((d) => (
              <option key={d.id} value={`domain:${d.id}`}>{d.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      <label className="sr-only" htmlFor="filter-severity">Severity</label>
      <select
        className={SELECT_CLASS}
        id="filter-severity"
        onChange={(event) =>
          onFilters({ ...filters, severity: event.target.value as MonitorFilters["severity"] })
        }
        value={filters.severity}
      >
        <option value="all">Severity: all</option>
        {SEVERITY_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* View toggle: actionable is the default triage view. */}
      <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border-strong" role="group" aria-label="Queue view">
        {(["actionable", "all"] as MonitorView[]).map((option) => (
          <button
            aria-pressed={view === option}
            className={`px-3 py-1.5 text-sm capitalize ${
              view === option ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-inset"
            }`}
            key={option}
            onClick={() => onView(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          {chips.map((chip) => (
            <button
              aria-label={`Remove ${chip.key} filter`}
              className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-inset px-2 py-0.5 text-xs text-fg hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
              key={chip.key}
              onClick={() => removeChip(chip.key)}
              type="button"
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            aria-label="Clear all filters"
            className="text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => onFilters(defaultMonitorFilters)}
            type="button"
          >
            Clear all
          </button>
        </div>
      )}
    </section>
  );
}
