import { useState } from "react";

import { Panel } from "@/dashboard/components/Panel";
import { useVault } from "@/dashboard/VaultContext";
import { defaultFilters, type VaultFilters } from "@/dashboard/filters";
import type { TimeRangePreset } from "@/dashboard/timeRange";
import {
  getDefaultFilters,
  getDefaultRange,
  getSidebarStartsCollapsed,
  getTheme,
  setDefaultFilters,
  setDefaultRange,
  setSidebarStartsCollapsed,
  setTheme,
  type ThemePref,
} from "@/dashboard/settings/preferences";

const selectClass =
  "rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm text-fg";

const TYPES = ["skill", "subagent", "prompt", "mcp-server", "hook", "command", "workflow"];
const TIERS = ["stock", "custom", "forked"];
const STATUSES = ["active", "deprecated", "retired", "plugin-managed", "project-specific"];
const RISKS = ["low", "medium", "high"];
const RANGES: TimeRangePreset[] = ["7d", "30d", "90d", "all"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint && <div className="text-xs text-subtle">{hint}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div aria-label={label} className="inline-flex rounded-md border border-border-strong p-0.5" role="group">
      {options.map((opt) => (
        <button
          aria-pressed={value === opt.value}
          className={`rounded px-3 py-1 text-sm ${
            value === opt.value ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"
          }`}
          key={opt.value}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** The persistent preferences home. Theme and the live scopes (time range,
 * filters) apply immediately and are saved as the load-time defaults; the sidebar
 * choice sets the initial state for the next load. */
export function PreferencesSection() {
  const { setTimeRangePreset, setFilters, filters: liveFilters } = useVault();
  const [theme, setThemeState] = useState<ThemePref>(() => getTheme());
  const [range, setRange] = useState<TimeRangePreset>(() => getDefaultRange());
  const [filters, setLocalFilters] = useState<VaultFilters>(() => getDefaultFilters());
  const [collapsed, setCollapsed] = useState(() => getSidebarStartsCollapsed());

  function chooseTheme(next: ThemePref) {
    setTheme(next);
    setThemeState(next);
  }

  function chooseRange(next: TimeRangePreset) {
    setRange(next);
    setDefaultRange(next);
    setTimeRangePreset(next);
  }

  function chooseFilter(key: keyof VaultFilters, value: string) {
    const next = { ...filters, [key]: value } as VaultFilters;
    setLocalFilters(next);
    setDefaultFilters(next);
    setFilters({ ...liveFilters, [key]: value } as VaultFilters);
  }

  function resetFilters() {
    setLocalFilters({ ...defaultFilters });
    setDefaultFilters(defaultFilters);
    setFilters({ ...liveFilters, type: "all", tier: "all", status: "all", risk: "all" });
  }

  function chooseSidebar(next: boolean) {
    setCollapsed(next);
    setSidebarStartsCollapsed(next);
  }

  return (
    <section aria-labelledby="settings-preferences" className="space-y-4" id="preferences">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg" id="settings-preferences">
          Preferences
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your defaults. Theme, range, and filters apply now and on every load.
        </p>
      </div>

      <Panel title="Display">
        <Field label="Theme">
          <Segmented
            label="Theme"
            onChange={chooseTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={theme}
          />
        </Field>
        <Field hint="Sets the initial sidebar state on the next load." label="Sidebar starts">
          <Segmented
            label="Sidebar starts"
            onChange={(v) => chooseSidebar(v === "collapsed")}
            options={[
              { value: "expanded", label: "Expanded" },
              { value: "collapsed", label: "Collapsed" },
            ]}
            value={collapsed ? "collapsed" : "expanded"}
          />
        </Field>
      </Panel>

      <Panel title="Data defaults">
        <Field label="Default time range">
          <select
            aria-label="Default time range"
            className={selectClass}
            onChange={(e) => chooseRange(e.target.value as TimeRangePreset)}
            value={range}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r === "all" ? "All time" : r}
              </option>
            ))}
          </select>
        </Field>
        <Field hint="Applied on load so you land on the slice you care about." label="Default filters">
          <select aria-label="Default type" className={selectClass} onChange={(e) => chooseFilter("type", e.target.value)} value={filters.type}>
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select aria-label="Default tier" className={selectClass} onChange={(e) => chooseFilter("tier", e.target.value)} value={filters.tier}>
            <option value="all">All tiers</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select aria-label="Default status" className={selectClass} onChange={(e) => chooseFilter("status", e.target.value)} value={filters.status}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select aria-label="Default risk" className={selectClass} onChange={(e) => chooseFilter("risk", e.target.value)} value={filters.risk}>
            <option value="all">All risk</option>
            {RISKS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            className="rounded-md border border-border-strong px-2.5 py-1.5 text-sm text-muted hover:bg-surface-inset hover:text-fg"
            onClick={resetFilters}
            type="button"
          >
            Reset to all
          </button>
        </Field>
      </Panel>
    </section>
  );
}
