import type { CSSProperties, ReactNode } from "react";

import { InfoTooltip } from "@/dashboard/components/InfoTooltip";

/**
 * The KPI grid is the SOLE place breakpoints are defined for a page header, so
 * every page resolves its column count here rather than hand-rolling a grid.
 */
type KpiColumns = 3 | 4;

const KPI_GRID: Record<KpiColumns, string> = {
  3: "grid grid-cols-1 gap-4 sm:grid-cols-3",
  4: "grid grid-cols-2 gap-4 lg:grid-cols-4",
};

interface PageHeaderProps {
  /** Optional telemetry/freshness meta band; rendered only when provided. */
  meta?: ReactNode;
  /** Optional search rail child; rendered BEFORE the toolbar in the DOM. */
  search?: ReactNode;
  /** Optional toolbar (filters, actions); rendered after the search child. */
  toolbar?: ReactNode;
  /** Optional KPI row content (typically KpiCard children). */
  kpis?: ReactNode;
  /** Column count for the KPI grid; the only breakpoint owner. Default 4. */
  kpiColumns?: KpiColumns;
  /**
   * Optional page title. OFF by default: the DashboardLayout shell owns the
   * page h1, so we do not render an h1 unless a title is explicitly passed.
   */
  title?: string;
  /** Optional supporting description shown under the title. */
  description?: ReactNode;
  /** Optional InfoTooltip content rendered beside the title. */
  info?: string;
  /** Stagger delay in ms, spread into the --rise-delay custom property. */
  riseDelay?: number;
}

/**
 * Shared page-header primitive: one section that composes an optional meta
 * band, an optional search/toolbar rail (search before toolbar), and an
 * optional KPI grid. Breakpoints live only in the KPI grid via kpiColumns.
 */
export function PageHeader({
  meta,
  search,
  toolbar,
  kpis,
  kpiColumns = 4,
  title,
  description,
  info,
  riseDelay,
}: PageHeaderProps) {
  const style =
    riseDelay === undefined
      ? undefined
      : ({ ["--rise-delay"]: `${riseDelay}ms` } as CSSProperties);

  return (
    <section className="space-y-4" style={style}>
      {title && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-fg">{title}</h1>
            {info && <InfoTooltip label={info} />}
          </div>
          {description && <p className="text-sm text-subtle">{description}</p>}
        </div>
      )}

      {meta != null && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-card">
          {meta}
        </div>
      )}

      {(search != null || toolbar != null) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between min-w-0">
          {search}
          {toolbar}
        </div>
      )}

      {kpis != null && <div className={KPI_GRID[kpiColumns]}>{kpis}</div>}
    </section>
  );
}
