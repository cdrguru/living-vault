import { Link } from "react-router-dom";

import { Pill } from "@/dashboard/components/Pill";
import { formatNumber, formatPercent } from "@/dashboard/format";
import {
  bundlesOf,
  dependenciesOf,
  duplicateClusters,
  utilizationByAssetWindowed,
  type DateWindow,
} from "@/data/metrics";
import type { VaultDataset } from "@/data/types";

import type { MonitorNode } from "./monitorMeta";
import { TONE_CLASS } from "./toneClass";
import { ToneGlyph } from "./ToneGlyph";

const PILL_TONE = {
  success: "green",
  danger: "red",
  warn: "amber",
  muted: "slate",
} as const;

/**
 * The asset inspector for a canvas selection. It mirrors the model ExplorerPanel
 * pattern (a right-rail aside that closes on a button and shows a relationship
 * list) but is grained to one asset, with its quadrant, the real measured signal,
 * and an explicit relationship list that doubles as the screen-reader description.
 */
export function MonitorInspector({
  dataset,
  node,
  window,
  onClose,
}: {
  dataset: VaultDataset;
  node: MonitorNode;
  window?: DateWindow;
  onClose: () => void;
}) {
  const deps = dependenciesOf(dataset, node.id);
  const bundles = bundlesOf(dataset, node.id);
  const tone = TONE_CLASS[node.tone];
  const usage = utilizationByAssetWindowed(dataset, window).get(node.id);
  const cluster = duplicateClusters(dataset).find((group) =>
    group.some((asset) => asset.id === node.id),
  );
  const duplicates = cluster
    ? cluster.filter((asset) => asset.id !== node.id)
    : [];

  const assetName = (id: string) =>
    dataset.assets.find((asset) => asset.id === id)?.name ?? id;

  return (
    <aside
      aria-label="Asset inspector"
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
          <div className="mt-1 flex items-center gap-2">
            <Pill tone={PILL_TONE[node.tone]}>
              <span className="mr-1 inline-flex">
                <ToneGlyph
                  className={tone.text}
                  glyph={
                    node.tone === "muted"
                      ? "dot"
                      : node.tone === "success"
                        ? "star"
                        : node.tone === "danger"
                          ? "alert"
                          : "flag"
                  }
                />
              </span>
              {node.quadrant}
            </Pill>
            <span className="text-xs uppercase tracking-[0.08em] text-subtle">
              {node.type}
            </span>
          </div>
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

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-subtle">Governed score</dt>
          <dd className="font-mono tabular-nums text-fg">
            {formatPercent(node.score.governedScore)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Required by</dt>
          <dd className="font-mono tabular-nums text-fg">
            {formatNumber(node.requiredByCount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Invocations</dt>
          <dd className="font-mono tabular-nums text-fg">
            {usage ? formatNumber(usage.invocations) : "No telemetry"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Success rate</dt>
          <dd className="font-mono tabular-nums text-fg">
            {usage && usage.invocations > 0
              ? formatPercent(usage.successRate)
              : "Not measured"}
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
          Relationships
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {deps.requires.length === 0 &&
            deps.requiredBy.length === 0 &&
            bundles.length === 0 &&
            duplicates.length === 0 && (
              <li className="text-subtle">No relationships recorded.</li>
            )}
          {deps.requires.map((asset) => (
            <li key={`req-${asset.id}`}>
              Requires <span className="font-medium text-fg">{asset.name}</span>
            </li>
          ))}
          {deps.requiredBy.map((asset) => (
            <li key={`reqby-${asset.id}`}>
              Required by{" "}
              <span className="font-medium text-fg">{asset.name}</span>
            </li>
          ))}
          {bundles.map((bundle) => (
            <li key={`bundle-${bundle.id}`}>
              Member of bundle{" "}
              <span className="font-medium text-fg">{bundle.name}</span>
            </li>
          ))}
          {duplicates.map((asset) => (
            <li key={`dup-${asset.id}`}>
              Duplicate content with{" "}
              <span className="font-medium text-fg">{assetName(asset.id)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
