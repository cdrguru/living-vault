import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { Pill } from "@/dashboard/components/Pill";
import { formatCompact, formatNumber, formatPercent } from "@/dashboard/format";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { useVault } from "@/dashboard/VaultContext";
import type { HarnessUsage } from "@/data";

import {
  formatLatencyMs,
  reliabilityIsFull,
  successRateOf,
  tokenFlag,
} from "./harnessFlags";

/**
 * One compact harness tile for the above-the-fold summary. It carries the same
 * key metrics and honesty flags as the full HarnessUsagePanel card, but in a tight
 * label-over-value stack so all four harnesses fit on one row without scrolling.
 */
function HarnessTile({ usage }: { usage: HarnessUsage }) {
  const reliabilityFull = reliabilityIsFull(usage);
  const tokens = tokenFlag(usage);

  return (
    <li className="min-w-0 rounded-lg border border-border bg-surface-inset p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-display text-sm font-semibold text-fg">
          {usage.label}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {formatNumber(usage.sessions)} sessions
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
            {formatCompact(usage.invocations)}
          </div>
          <div className="eyebrow text-subtle">invocations</div>
        </div>

        {reliabilityFull ? (
          <div className="min-w-0">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {formatPercent(successRateOf(usage))}
            </div>
            <div className="eyebrow text-subtle">success</div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
              {formatNumber(usage.errors)}
            </div>
            <div className="eyebrow text-subtle">errors</div>
            <span className="mt-1 inline-flex">
              <Pill severity="warn" tone="amber">
                partial
              </Pill>
            </span>
          </div>
        )}

        <div className="min-w-0">
          <div className="truncate font-mono text-base font-semibold tabular-nums text-fg">
            {usage.tracked.tokens === "none" ? (
              <span className="text-subtle">{"-"}</span>
            ) : (
              formatCompact(usage.tokens)
            )}
          </div>
          <div className="eyebrow text-subtle">tokens</div>
          {tokens && <span className="eyebrow text-subtle">{tokens}</span>}
        </div>
      </div>

      <div className="mt-2 text-xs text-subtle">
        mean latency{" "}
        <span className="font-mono tabular-nums text-muted">
          {formatLatencyMs(usage.latencyMs)}
        </span>
      </div>
    </li>
  );
}

/**
 * A compact, above-the-fold summary of usage across all agent harnesses (Codex,
 * Grok, Claude Code, Copilot), read from getHarnessUsage on the DataSource. It
 * makes harness telemetry discoverable at the top of the Monitor page and links
 * down to the full HarnessUsagePanel for the per-harness detail and notes.
 *
 * @param detailsHref the in-page anchor (an element id) of the full panel, used
 *   by the "View details" link to scroll the detailed panel into view.
 */
export function HarnessSummaryStrip({ detailsHref }: { detailsHref: string }) {
  const { getHarnessUsage } = useVault();
  const sources = getHarnessUsage();

  return (
    <section
      aria-label="Harness usage summary"
      className="rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-sm font-semibold tracking-tight text-fg">
            Harness usage at a glance
          </h2>
          <InfoTooltip
            label={TOOLTIPS["monitor.harnessUsage"]}
            triggerLabel="About harness usage"
          />
          <span className="eyebrow text-subtle">{sources.length} harnesses</span>
        </div>
        <a
          className="rounded text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          href={`#${detailsHref}`}
        >
          View details
        </a>
      </header>

      {sources.length === 0 ? (
        <EmptyState>No harness usage in the current snapshot.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sources.map((usage) => (
            <HarnessTile key={usage.source} usage={usage} />
          ))}
        </ul>
      )}
    </section>
  );
}
