import type { ReactNode } from "react";

import { EmptyState } from "@/dashboard/components/EmptyState";
import { Panel } from "@/dashboard/components/Panel";
import { Pill } from "@/dashboard/components/Pill";
import {
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/dashboard/format";
import { useVault } from "@/dashboard/VaultContext";
import {
  codexBillingSnapshot,
  codexWorkspaceUsageSnapshot,
  type HarnessUsage,
} from "@/data";

import {
  formatLatencyMs,
  reliabilityIsFull,
  successRateOf,
} from "./harnessFlags";

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-lg font-semibold tabular-nums text-fg">
        {value}
      </div>
      <div className="eyebrow mt-0.5 text-subtle">{label}</div>
      {sub}
    </div>
  );
}

function WorkspaceMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-sm font-semibold tabular-nums text-fg">
        {value}
      </div>
      <div className="eyebrow mt-0.5 text-subtle">{label}</div>
    </div>
  );
}

/**
 * One harness's usage summary. Metrics are rendered in each harness's own terms:
 * a reliable success rate only when successes are fully tracked, otherwise the
 * detectable error count flagged "partial"; tokens muted when a harness does not
 * log them. The note explains the grain so cards are not read as a leaderboard.
 */
function HarnessCard({ usage }: { usage: HarnessUsage }) {
  const successRate = successRateOf(usage);
  // A success rate is honest when successes are fully measured or derived from
  // real counts (calls minus failures); when only failures are detectable
  // ("partial"), show the error count instead.
  const reliabilityFull = reliabilityIsFull(usage);
  const hasCodexWorkspaceUsage =
    usage.source === "codex" &&
    (codexWorkspaceUsageSnapshot.totals.turns > 0 ||
      codexWorkspaceUsageSnapshot.totals.sessions > 0 ||
      codexWorkspaceUsageSnapshot.totals.reviews > 0);

  return (
    <li className="rounded-lg border border-border bg-surface-inset p-3">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-sm font-semibold text-fg">
            {usage.label}
          </span>
          {usage.models.length > 0 && (
            <span
              className="truncate text-xs text-subtle"
              title={usage.models.join(", ")}
            >
              {usage.models.length === 1
                ? usage.models[0]
                : `${usage.models.length} models`}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted">
          {formatNumber(usage.sessions)} sessions
          {usage.windowStart && usage.windowEnd && (
            <>
              {" · "}
              {formatDate(usage.windowStart)} to {formatDate(usage.windowEnd)}
            </>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="invocations" value={formatCompact(usage.invocations)} />
        {reliabilityFull ? (
          <Metric label="success rate" value={formatPercent(successRate)} />
        ) : (
          <Metric
            label="errors"
            value={formatNumber(usage.errors)}
            sub={
              <span className="mt-1 inline-flex">
                <Pill severity="warn" tone="amber">
                  partial
                </Pill>
              </span>
            }
          />
        )}
        <Metric label="mean latency" value={formatLatencyMs(usage.latencyMs)} />
        <Metric
          label="tokens"
          value={
            usage.tracked.tokens === "none" ? (
              <span className="text-subtle">{"-"}</span>
            ) : (
              formatCompact(usage.tokens)
            )
          }
          sub={
            usage.tracked.tokens === "occupancy" ? (
              <span className="eyebrow text-subtle">occupancy</span>
            ) : usage.tracked.tokens === "partial" ? (
              <span className="eyebrow text-subtle">partial</span>
            ) : usage.tracked.tokens === "none" ? (
              <span className="eyebrow text-subtle">not tracked</span>
            ) : undefined
          }
        />
      </div>

      {usage.source === "codex" && codexBillingSnapshot.totals.credits > 0 && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-mono tabular-nums text-fg">
            {formatNumber(codexBillingSnapshot.totals.credits)}
          </span>{" "}
          actual credits from ChatGPT/Codex analytics.
        </p>
      )}

      {hasCodexWorkspaceUsage && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid grid-cols-3 gap-3">
            <WorkspaceMetric
              label="Workspace turns"
              value={formatCompact(codexWorkspaceUsageSnapshot.totals.turns)}
            />
            <WorkspaceMetric
              label="Admin sessions"
              value={formatCompact(codexWorkspaceUsageSnapshot.totals.sessions)}
            />
            <WorkspaceMetric
              label="Code reviews"
              value={formatCompact(codexWorkspaceUsageSnapshot.totals.reviews)}
            />
          </div>
          <p className="mt-2 text-xs text-subtle">
            Codex admin analytics export, separate from local rollout logs.
          </p>
        </div>
      )}

      {usage.note && (
        <p className="mt-2 text-xs text-subtle">{usage.note}</p>
      )}
    </li>
  );
}

/**
 * Real usage per agent harness (Claude Code, Codex, ...), each read from that
 * tool's own local session logs through getHarnessUsage on the DataSource. Reads
 * the already loaded snapshot only; adds no VaultDataset contract fields.
 */
export function HarnessUsagePanel() {
  const { getHarnessUsage } = useVault();
  const sources = getHarnessUsage();

  return (
    <Panel
      action={<span className="eyebrow">{sources.length} harnesses</span>}
      info="monitor.harnessUsage"
      title="Usage by harness"
    >
      <p className="mb-3 text-xs text-muted">
        Real usage per agent harness, read locally from each tool's own session
        logs (counts and timings only, never message content). Grains differ by
        harness, so read each card on its own terms rather than as a leaderboard.
      </p>
      {sources.length === 0 ? (
        <EmptyState>No harness usage in the current snapshot.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {sources.map((usage) => (
            <HarnessCard key={usage.source} usage={usage} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
