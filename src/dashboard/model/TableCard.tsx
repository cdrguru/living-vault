import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import type { Rect } from "./geometry";
import type { TableMeta } from "./modelMeta";
import { healthStatus, type HealthStatus, type TableSignal } from "./signals";
import { Sparkline } from "@/dashboard/components/Sparkline";
import { Tip } from "./Tip";

const pct = (value: number): number => Math.round(value * 100);

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  attention: "Attention",
  "at-risk": "At risk",
  unknown: "No data",
};

const HEALTH_CHIP: Record<HealthStatus, string> = {
  healthy: "bg-success-surface text-success-fg",
  attention: "bg-warning-surface text-warning-fg",
  "at-risk": "bg-danger-surface text-danger-fg",
  unknown: "bg-surface-inset text-subtle",
};

const HEALTH_BORDER: Record<HealthStatus, string> = {
  healthy: "border-t-success",
  attention: "border-t-warning",
  "at-risk": "border-t-danger",
  unknown: "border-t-accent",
};

function Chip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn";
}) {
  const tones =
    tone === "warn"
      ? "bg-warning-surface text-warning-fg"
      : "bg-surface-inset text-subtle";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium ${tones}`}
    >
      {children}
    </span>
  );
}

export function TableCard({
  animatePosition,
  count,
  dimmed,
  health = false,
  meta,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
  onHoverChange,
  onSelect,
  rect,
  selected,
  signal = null,
}: {
  animatePosition: boolean;
  count: number;
  dimmed: boolean;
  health?: boolean;
  meta: TableMeta;
  onHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onHeaderPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onHoverChange: (hovered: boolean) => void;
  onSelect: () => void;
  rect: Rect;
  selected: boolean;
  signal?: TableSignal | null;
}) {
  const isJoin = meta.role === "join";
  const isHub = meta.id === "Asset";
  // In the Health view the hub's top edge and a status chip reflect its derived
  // health; otherwise the hub keeps its neutral accent identity.
  const status: HealthStatus | null = health && signal ? healthStatus(signal) : null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      aria-label={`${meta.id} table, ${count} rows`}
      className={[
        "absolute select-none overflow-hidden rounded-lg bg-surface-raised text-left shadow-sm focus-visible:outline-2 focus-visible:outline-accent",
        isJoin
          ? "border border-dashed border-border-strong"
          : "border border-border",
        isHub
          ? `border-t-[3px] shadow-md ${status ? HEALTH_BORDER[status] : "border-t-accent"}`
          : "",
        animatePosition
          ? "motion-safe:transition-[left,top,opacity] motion-safe:duration-300"
          : "",
        dimmed ? "opacity-40" : "",
        selected ? "ring-2 ring-accent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onBlur={() => onHoverChange(false)}
      onClick={onSelect}
      onFocus={() => onHoverChange(true)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      role="button"
      style={{
        height: rect.height,
        left: rect.x,
        top: rect.y,
        width: rect.width,
      }}
      tabIndex={0}
    >
      {/*
       * The pulse target is this inner wrapper, never the focusable root, so a
       * fly-to focus pulse scales the card content without stealing focus from
       * the selected card. The wrapper fills the root, so the pop reads as the
       * whole card breathing.
       */}
      <div className="flex h-full flex-col" data-table-id={meta.id}>
        <header
          className="flex cursor-grab items-center gap-1.5 border-b border-border px-3 py-2 active:cursor-grabbing"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
        >
          <span
            className={`truncate text-base font-semibold ${isHub ? "text-accent-strong" : "text-fg"}`}
          >
            {meta.id}
          </span>
          {meta.partitioned && (
            <Tip label="Partitioned by tenantId">
              <span className="rounded-full bg-surface-inset px-1.5 py-0.5 text-[0.6875rem] font-medium text-subtle">
                tenant
              </span>
            </Tip>
          )}
          <span className="ml-auto text-sm tabular-nums text-subtle">
            {count}
          </span>
        </header>
        <div className="space-y-1.5 px-3 py-2">
          {meta.groups.map((group) => (
            <div key={group.label}>
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-subtle">
                {group.label}
              </div>
              <div className="line-clamp-2 text-[0.8125rem] leading-snug text-muted">
                {group.fields.join(" · ")}
              </div>
            </div>
          ))}
        </div>
        {signal && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
            {status && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold ${HEALTH_CHIP[status]}`}
              >
                {HEALTH_LABEL[status]}
              </span>
            )}
            <Chip>Gov {pct(signal.governedRate)}%</Chip>
            <Chip>Eff {pct(signal.effectiveRate)}%</Chip>
            {signal.hasTelemetry ? (
              <Chip>Err {pct(signal.errorRate)}%</Chip>
            ) : (
              <span className="text-[0.625rem] font-medium text-subtle">
                No telemetry
              </span>
            )}
            {signal.staleCount > 0 && (
              <Chip tone="warn">{signal.staleCount} stale</Chip>
            )}
            <span className="ml-auto">
              <Sparkline
                label={
                  signal.hasTelemetry
                    ? `${signal.invocations} invocations over ${signal.series.length} days`
                    : "No telemetry"
                }
                series={signal.series}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
