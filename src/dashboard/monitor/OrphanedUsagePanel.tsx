import { EmptyState } from "@/dashboard/components/EmptyState";
import { Panel } from "@/dashboard/components/Panel";
import { useVault } from "@/dashboard/VaultContext";
import { formatNumber } from "@/dashboard/format";
import { actionableOrphans } from "@/dashboard/monitor/orphanFilter";

const PREVIEW_LIMIT = 12;

/**
 * Real Claude Code usage that did not resolve to any governed catalog asset,
 * ranked highest count first. These are measured invocation counts from the
 * committed telemetry snapshot, read through getUnattributedUsage on the
 * DataSource. This reads the already-loaded array only; it adds no VaultDataset
 * contract fields and mutates nothing.
 */
export function OrphanedUsagePanel() {
  const { getUnattributedUsage } = useVault();
  // Personal-life keys can never be catalogued, so drop them from the actionable
  // list but report the hidden count rather than silently shrinking the panel.
  const { shown: actionable, hiddenPersonal } = actionableOrphans(
    getUnattributedUsage(),
  );
  const shown = actionable.slice(0, PREVIEW_LIMIT);

  return (
    <Panel
      action={<span className="eyebrow">{actionable.length} keys</span>}
      info="monitor.orphanedUsage"
      title="Orphaned usage"
    >
      <p className="mb-3 text-xs text-muted">
        Real Claude Code usage outside the governed catalog. These keys ran in
        your transcripts but match no asset in the Vault, so they are tracked
        here rather than scored.
      </p>
      {shown.length === 0 ? (
        <EmptyState>No unattributed usage in the current snapshot.</EmptyState>
      ) : (
        <ol className="space-y-1.5">
          {shown.map((row, index) => (
            <li
              className="flex items-center justify-between gap-3 text-sm"
              key={row.key}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-subtle">
                  {index + 1}
                </span>
                <span className="truncate font-medium text-fg" title={row.key}>
                  {row.key}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                {formatNumber(row.count)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {actionable.length > PREVIEW_LIMIT && (
        <div className="mt-2 text-xs text-subtle">
          + {actionable.length - PREVIEW_LIMIT} more keys
        </div>
      )}
      {hiddenPersonal > 0 && (
        <div className="mt-2 text-xs text-subtle">
          + {hiddenPersonal} personal keys hidden
        </div>
      )}
    </Panel>
  );
}
