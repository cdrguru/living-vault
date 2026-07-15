import { Link } from "react-router-dom";

import { assetSignal, governanceChecks } from "@/data";
import type { VaultDataset } from "@/data";
import { AssetStateBadges } from "@/dashboard/components/AssetStateBadge";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { GovernanceChecklist } from "@/dashboard/components/GovernanceChecklist";
import { Pill } from "@/dashboard/components/Pill";
import { formatDate, formatNumber } from "@/dashboard/format";

import {
  RELATIONSHIPS,
  RELATIONSHIP_LIST,
  TABLES,
  type RelationshipId,
  type TableId,
  type TableRole,
} from "./modelMeta";

export type ModelSelection =
  | { kind: "table"; id: TableId }
  | { kind: "relationship"; id: RelationshipId }
  | { kind: "asset"; id: string }
  | null;

/**
 * The asset-state block: the quadrant and derived flags as badges, plus the six
 * governance checks as pass/fail rows. Shared so the inspector and a future
 * per-node Monitor selection explain an asset's state through one primitive. The
 * canvas resolves to an asset either through an explicit asset selection or when
 * the Asset hub is the only asset in view.
 */
function AssetStateBlock({
  dataset,
  assetId,
}: {
  dataset: VaultDataset;
  assetId: string;
}) {
  const signal = assetSignal(dataset, assetId);
  if (!signal) return null;
  const checks = governanceChecks(signal.asset, dataset);
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
        Asset state
      </h3>
      <div className="mt-2">
        <AssetStateBadges signal={signal} />
      </div>
      <GovernanceChecklist checks={checks} className="mt-3" />
    </div>
  );
}

interface PreviewRow {
  key: string;
  primary: string;
  secondary?: string;
  href?: string;
}

const PREVIEW_LIMIT = 8;

const ROLE_LABEL: Record<TableRole, string> = {
  entity: "Entity",
  fact: "Fact",
  join: "Join table",
};

function previewRows(id: TableId, dataset: VaultDataset): PreviewRow[] {
  const assetName = (assetId: string) =>
    dataset.assets.find((asset) => asset.id === assetId)?.name ?? assetId;
  const tagName = (tagId: string) =>
    dataset.tags.find((tag) => tag.id === tagId)?.name ?? tagId;
  const bundleName = (bundleId: string) =>
    dataset.bundles.find((bundle) => bundle.id === bundleId)?.name ?? bundleId;

  switch (id) {
    case "Asset":
      return dataset.assets.map((asset) => ({
        key: asset.id,
        primary: asset.name,
        secondary: `${asset.type} · ${asset.status}`,
        href: `/asset/${asset.id}`,
      }));
    case "Owner":
      return dataset.owners.map((owner) => ({
        key: owner.id,
        primary: owner.name,
        secondary: `${owner.email} · ${owner.role}`,
      }));
    case "Origin":
      return dataset.origins.map((origin) => ({
        key: origin.id,
        primary: origin.name,
        secondary: origin.url ? `${origin.kind} · ${origin.url}` : origin.kind,
      }));
    case "Tag":
      return dataset.tags.map((tag) => ({
        key: tag.id,
        primary: tag.name,
        secondary: tag.kind,
      }));
    case "Bundle":
      return dataset.bundles.map((bundle) => ({
        key: bundle.id,
        primary: bundle.name,
        secondary: bundle.description,
      }));
    case "Utilization":
      return dataset.utilization.map((row) => ({
        key: row.id,
        primary: `${assetName(row.assetId)} · ${formatDate(row.date)}`,
        secondary: `${formatNumber(row.invocations)} invocations · ${formatNumber(row.errors)} errors`,
      }));
    case "AssetTag":
      return dataset.assetTags.map((row) => ({
        key: `${row.assetId}-${row.tagId}`,
        primary: assetName(row.assetId),
        secondary: `tagged ${tagName(row.tagId)}`,
      }));
    case "BundleMembership":
      return dataset.bundleMemberships.map((row) => ({
        key: `${row.bundleId}-${row.assetId}`,
        primary: bundleName(row.bundleId),
        secondary: `contains ${assetName(row.assetId)}`,
      }));
    case "AssetDependency":
      return dataset.dependencies.map((row) => ({
        key: `${row.assetId}-${row.dependsOnAssetId}`,
        primary: assetName(row.assetId),
        secondary: `depends on ${assetName(row.dependsOnAssetId)}`,
      }));
  }
}

function relationshipRows(
  id: RelationshipId,
  dataset: VaultDataset,
): PreviewRow[] {
  const ownerName = (ownerId: string) =>
    dataset.owners.find((owner) => owner.id === ownerId)?.name ?? ownerId;
  const originName = (originId: string) =>
    dataset.origins.find((origin) => origin.id === originId)?.name ?? originId;

  switch (id) {
    case "asset-owner":
      return dataset.assets
        .filter((asset) => asset.ownerId)
        .map((asset) => ({
          key: asset.id,
          primary: asset.name,
          secondary: `owned by ${ownerName(asset.ownerId!)}`,
          href: `/asset/${asset.id}`,
        }));
    case "asset-origin":
      return dataset.assets
        .filter((asset) => asset.originId)
        .map((asset) => ({
          key: asset.id,
          primary: asset.name,
          secondary: `from ${originName(asset.originId!)}`,
          href: `/asset/${asset.id}`,
        }));
    case "asset-tag":
      return previewRows("AssetTag", dataset);
    case "bundle-asset":
      return previewRows("BundleMembership", dataset);
    case "asset-dependency":
      return previewRows("AssetDependency", dataset);
    case "asset-utilization":
      return previewRows("Utilization", dataset);
  }
}

function RowList({ rows }: { rows: PreviewRow[] }) {
  if (!rows.length) return <EmptyState>No rows in the vault yet.</EmptyState>;
  const shown = rows.slice(0, PREVIEW_LIMIT);
  return (
    <>
      <ul className="space-y-1.5">
        {shown.map((row) => (
          <li className="text-sm" key={row.key}>
            {row.href ? (
              <Link
                className="font-medium text-fg hover:text-accent-strong"
                to={row.href}
              >
                {row.primary}
              </Link>
            ) : (
              <span className="font-medium text-fg">{row.primary}</span>
            )}
            {row.secondary && (
              <div className="text-xs text-subtle">{row.secondary}</div>
            )}
          </li>
        ))}
      </ul>
      {rows.length > PREVIEW_LIMIT && (
        <div className="mt-2 text-xs text-subtle">
          + {rows.length - PREVIEW_LIMIT} more
        </div>
      )}
    </>
  );
}

export function ExplorerPanel({
  dataset,
  onClose,
  onSelectRelationship,
  selection,
}: {
  dataset: VaultDataset;
  onClose: () => void;
  onSelectRelationship: (id: RelationshipId) => void;
  selection: ModelSelection;
}) {
  if (!selection) return null;

  const closeButton = (
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
  );

  // An asset selection resolves to one asset; the inspector explains its state
  // through the shared badges and the governance checklist.
  if (selection.kind === "asset") {
    const asset = dataset.assets.find((row) => row.id === selection.id);
    return (
      <aside
        aria-label="Model explorer"
        className="absolute inset-y-0 right-0 z-10 w-80 overflow-y-auto border-l-[3px] border-l-accent border-border bg-surface-raised p-4 shadow-lg motion-safe:transition-transform motion-safe:duration-300"
      >
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-accent-strong ring-1 ring-inset ring-accent/30">
          <svg
            aria-hidden="true"
            className="h-3 w-3"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M8 1l2 4.5 4.9.4-3.7 3.2 1.1 4.8L8 11.4 3.7 13.9l1.1-4.8L1.1 5.9l4.9-.4z" />
          </svg>
          Selected asset
        </div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-fg">
              {asset?.name ?? "Asset"}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <Pill tone="slate">{asset ? asset.type : "Asset"}</Pill>
            </div>
          </div>
          {closeButton}
        </div>
        {asset ? (
          <>
            {asset.description && (
              <p className="mt-3 text-sm text-muted">{asset.description}</p>
            )}
            <AssetStateBlock assetId={asset.id} dataset={dataset} />
            <div className="mt-4">
              <Link
                className="text-sm font-medium text-accent-strong hover:underline"
                to={`/asset/${asset.id}`}
              >
                Open asset detail
              </Link>
            </div>
          </>
        ) : (
          <EmptyState>That asset is not in the catalogue.</EmptyState>
        )}
      </aside>
    );
  }

  const table = selection.kind === "table" ? TABLES[selection.id] : null;
  const relationship =
    selection.kind === "relationship" ? RELATIONSHIPS[selection.id] : null;
  const title = table ? table.id : relationship!.title;

  return (
    <aside
      aria-label="Model explorer"
      className="absolute inset-y-0 right-0 z-10 w-80 overflow-y-auto border-l-[3px] border-l-accent border-border bg-surface-raised p-4 shadow-lg motion-safe:transition-transform motion-safe:duration-300"
    >
      {/*
       * A clear selected-node banner so it is obvious this panel describes the
       * node clicked on the canvas. State reads through color plus an icon plus
       * the word, never color alone (WCAG 1.4.1).
       */}
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-accent-strong ring-1 ring-inset ring-accent/30">
        <svg
          aria-hidden="true"
          className="h-3 w-3"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M8 1l2 4.5 4.9.4-3.7 3.2 1.1 4.8L8 11.4 3.7 13.9l1.1-4.8L1.1 5.9l4.9-.4z" />
        </svg>
        {table ? "Selected table" : "Selected relationship"}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <div className="mt-1 flex items-center gap-2">
            {table ? (
              <>
                <Pill tone={table.role === "join" ? "blue" : "slate"}>
                  {ROLE_LABEL[table.role]}
                </Pill>
                <span className="text-xs tabular-nums text-subtle">
                  {table.count(dataset)} rows
                </span>
              </>
            ) : (
              <>
                <Pill tone="blue">Relationship</Pill>
                <span className="text-xs tabular-nums text-subtle">
                  {relationship!.count(dataset)} links
                </span>
              </>
            )}
          </div>
        </div>
        {closeButton}
      </div>

      <p className="mt-3 text-sm text-muted">
        {table ? table.description : relationship!.explanation}
      </p>
      {table?.partitioned && (
        <p className="mt-1 text-xs text-subtle">Partitioned by tenantId.</p>
      )}

      {table && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            Relationships
          </h3>
          <ul className="mt-2 space-y-1">
            {RELATIONSHIP_LIST.filter(
              (rel) => rel.endpoints.includes(table.id) || rel.via === table.id,
            ).map((rel) => (
              <li key={rel.id}>
                <button
                  className="text-left text-sm text-accent-strong hover:underline"
                  onClick={() => onSelectRelationship(rel.id)}
                  type="button"
                >
                  {rel.title}
                  <span className="ml-1 text-xs tabular-nums text-subtle">
                    ({rel.count(dataset)})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
          Rows
        </h3>
        <div className="mt-2">
          <RowList
            rows={
              table
                ? previewRows(table.id, dataset)
                : relationshipRows(relationship!.id, dataset)
            }
          />
        </div>
      </div>
    </aside>
  );
}
