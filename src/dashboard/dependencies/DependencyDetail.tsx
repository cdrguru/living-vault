import { Link } from "react-router-dom";

import { Pill } from "@/dashboard/components/Pill";
import { formatNumber } from "@/dashboard/format";
import { dependenciesOf } from "@/data/metrics";
import type { AssetRow, AssetStatus, VaultDataset } from "@/data/types";

import { TONE_CLASS } from "@/dashboard/monitor/toneClass";
import { TONE_GLYPH } from "@/dashboard/monitor/monitorMeta";
import { ToneGlyph } from "@/dashboard/monitor/ToneGlyph";

import type { DependencyNode } from "./dependencyMeta";

const PILL_TONE = {
  success: "green",
  danger: "red",
  warn: "amber",
  muted: "slate",
} as const;

/** Statuses that make a requires edge fragile, so the target reads as a warning. */
const FRAGILE_STATUS: Record<string, { tone: "amber" | "red"; label: string }> =
  {
    deprecated: { tone: "amber", label: "deprecated" },
    retired: { tone: "red", label: "retired" },
  };

function fragileOf(status: AssetStatus) {
  return FRAGILE_STATUS[status];
}

/** A linked, tone-aware chip for one related asset, flagging fragile targets. */
function RelatedChip({ asset }: { asset: AssetRow }) {
  const fragile = fragileOf(asset.status);
  return (
    <Link
      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
      to={`/asset/${asset.id}`}
    >
      <Pill tone={fragile ? fragile.tone : "blue"}>
        <span>{asset.name}</span>
        {fragile && (
          <span className="ml-1.5 font-normal opacity-80">{fragile.label}</span>
        )}
      </Pill>
    </Link>
  );
}

/** The body shared by the inline and overlay forms of the detail panel. */
function DetailBody({
  dataset,
  node,
}: {
  dataset: VaultDataset;
  node: DependencyNode;
}) {
  const deps = dependenciesOf(dataset, node.id);
  const tone = TONE_CLASS[node.tone];

  return (
    <>
      <div className="flex items-center gap-2">
        <Pill tone={PILL_TONE[node.tone]}>
          <span className="mr-1 inline-flex">
            <ToneGlyph className={tone.text} glyph={TONE_GLYPH[node.tone]} />
          </span>
          {node.quadrant}
        </Pill>
        <span className="text-xs uppercase tracking-[0.08em] text-subtle">
          {node.type}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-subtle">Requires</dt>
          <dd className="font-mono tabular-nums text-fg">
            {formatNumber(node.requiresCount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Required by</dt>
          <dd className="font-mono tabular-nums text-fg">
            {formatNumber(node.requiredByCount)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <Link
          className="text-sm font-medium text-accent-strong hover:underline"
          to={`/asset/${node.id}`}
        >
          Open asset detail
        </Link>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
          Requires
        </h3>
        {deps.requires.length === 0 ? (
          <p className="mt-1 text-sm text-subtle">Requires nothing.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {deps.requires.map((asset) => (
              <RelatedChip asset={asset} key={`req-${asset.id}`} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
          Required by
        </h3>
        {deps.requiredBy.length === 0 ? (
          <p className="mt-1 text-sm text-subtle">Required by nothing.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {deps.requiredBy.map((asset) => (
              <RelatedChip asset={asset} key={`reqby-${asset.id}`} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The dependency inspector for a selected node. With onClose it renders as a
 * closeable right-rail overlay aside (used on the canvas); without it renders as an
 * inline block (reused in the no-JS fallback). It mirrors MonitorInspector but is
 * grained to dependencies only: the quadrant pill, the requires and required-by
 * counts, a link to the asset detail, and the resolved requires and required-by
 * lists, flagging deprecated or retired targets as fragile.
 */
export function DependencyDetail({
  dataset,
  node,
  onClose,
}: {
  dataset: VaultDataset;
  node: DependencyNode;
  onClose?: () => void;
}) {
  if (!onClose) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-card">
        <h2 className="text-base font-semibold text-fg">{node.name}</h2>
        <div className="mt-2">
          <DetailBody dataset={dataset} node={node} />
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="Dependency inspector"
      className="absolute inset-y-0 right-0 z-30 w-80 overflow-y-auto border-l-2 border-accent bg-surface-raised p-4 shadow-xl motion-safe:transition-transform motion-safe:duration-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="eyebrow flex items-center gap-1.5 text-accent">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-accent"
            />
            Selected node
          </span>
          <h2 className="mt-1 text-base font-semibold text-fg">{node.name}</h2>
        </div>
        <button
          aria-label="Close panel"
          className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-fg"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
          >
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <DetailBody dataset={dataset} node={node} />
    </aside>
  );
}
