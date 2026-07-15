import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { assetSignal, classificationReason, type AssetSignal } from "@/data";
import type { AssetInput, AssetRow } from "@/data";
import { lifecycleOf, scopeOf } from "@/data/assetStatus";
import { useVault } from "@/dashboard/VaultContext";
import { defaultFilters } from "@/dashboard/filters";
import { formatDate, formatPercent } from "@/dashboard/format";
import { AssetStateBadge } from "@/dashboard/components/AssetStateBadge";
import { Button } from "@/dashboard/components/Button";
import type { ColumnFilterDef } from "@/dashboard/components/columnFilters";
import { CollapsibleCard } from "@/dashboard/components/CollapsibleCard";
import { DataTable } from "@/dashboard/components/DataTable";
import { useColumnFilters } from "@/dashboard/components/useColumnFilters";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { InfoTooltip } from "@/dashboard/components/InfoTooltip";
import { Meter } from "@/dashboard/components/Meter";
import { Panel } from "@/dashboard/components/Panel";
import { TOOLTIPS } from "@/dashboard/tooltips";
import { Pill, type PillTone } from "@/dashboard/components/Pill";
import { Skeleton } from "@/dashboard/components/Skeleton";
import { lifecyclePill, riskPill } from "@/dashboard/statusPill";

const tierTone = (tier: AssetRow["tier"]): PillTone =>
  tier === "stock" ? "blue" : tier === "forked" ? "amber" : "slate";

// Scope reads blue for plugin-managed, slate for project-specific. The text
// label inside the Pill keeps the two distinguishable without relying on color.
const scopeTone = (scope: "plugin-managed" | "project-specific"): PillTone =>
  scope === "plugin-managed" ? "blue" : "slate";

/**
 * The scope marker for an asset, or a muted dash when the status is a plain
 * lifecycle stage with no scope. The Pill carries a text label (not just a
 * color), so scope reads without color alone (WCAG 1.4.1).
 */
function ScopeBadge({ status }: { status: AssetRow["status"] }) {
  const scope = scopeOf(status);
  if (!scope) {
    return (
      <span aria-label="No scope" className="text-subtle">
        -
      </span>
    );
  }
  return <Pill tone={scopeTone(scope)}>{scope}</Pill>;
}

const defaultInput: AssetInput = {
  type: "prompt",
  name: "",
  slug: "",
  description: "",
  body: "",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.7,
  tier: "custom",
  originId: "org-local",
  ownerId: "own-lee",
  tagIds: ["tag-d-0", "tag-c-0"],
};

export function CataloguePage() {
  const {
    addAsset,
    dataset,
    filteredAssets,
    loading,
    retireAsset,
    setFilters,
    updateAsset,
  } = useVault();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState<AssetInput>(defaultInput);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // open: full form; minimized: header bar only; closed: card unmounted.
  // Default closed so the page lands on the catalogue list (browse first); the
  // form opens on demand from the header "Add asset" button.
  const [formState, setFormState] = useState<"open" | "minimized" | "closed">(
    "closed",
  );
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Set when the form is opened from an action that should land focus on Name
  // (the empty-state CTA); the effect below focuses once the field has mounted.
  const focusNameOnOpen = useRef(false);
  const sorted = useMemo(
    () =>
      [...filteredAssets].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [filteredAssets],
  );
  const originById = useMemo(
    () =>
      new Map(
        (dataset?.origins ?? []).map((origin) => [origin.id, origin] as const),
      ),
    [dataset],
  );
  const signalById = useMemo(() => {
    const map = new Map<string, AssetSignal>();
    if (!dataset) return map;
    for (const asset of dataset.assets) {
      const signal = assetSignal(dataset, asset.id);
      if (signal) map.set(asset.id, signal);
    }
    return map;
  }, [dataset]);

  // Per-column header filters for the catalogue table. State values map to the
  // rendered columns; the State and Origin accessors close over the derived maps
  // above so they filter on the same value the cell shows.
  const columns = useMemo<ColumnFilterDef<AssetRow>[]>(
    () => [
      {
        key: "asset",
        label: "Asset",
        type: "text",
        value: (a) => `${a.name} ${a.slug}`,
      },
      {
        key: "type",
        label: "Type",
        type: "select",
        value: (a) => a.type,
        order: [
          "skill",
          "subagent",
          "prompt",
          "mcp-server",
          "hook",
          "command",
          "workflow",
        ],
      },
      {
        key: "tier",
        label: "Tier",
        type: "select",
        value: (a) => a.tier,
        order: ["stock", "custom", "forked"],
      },
      {
        key: "risk",
        label: "Risk",
        type: "select",
        value: (a) => a.riskLevel,
        order: ["low", "medium", "high"],
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        value: (a) => lifecycleOf(a.status),
        order: ["active", "deprecated", "retired"],
      },
      {
        key: "scope",
        label: "Scope",
        type: "select",
        value: (a) => scopeOf(a.status) ?? "",
        order: ["plugin-managed", "project-specific"],
      },
      {
        key: "state",
        label: "State",
        type: "select",
        value: (a) => signalById.get(a.id)?.quadrant ?? null,
        order: ["Stars", "Risks", "Shelfware", "Dead weight"],
      },
      {
        key: "origin",
        label: "Origin",
        type: "select",
        value: (a) =>
          a.originId ? (originById.get(a.originId)?.name ?? null) : null,
      },
    ],
    [signalById, originById],
  );
  const columnFilters = useColumnFilters(columns);
  const view = columnFilters.bind(sorted);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || !dataset) return;
    const asset = dataset.assets.find((row) => row.id === editId);
    if (!asset) return;
    setEditing(asset);
    setFormState("open");
    setInput({
      type: asset.type,
      name: asset.name,
      slug: asset.slug,
      description: asset.description,
      system: asset.system,
      body: asset.body,
      version: asset.version,
      status: asset.status,
      riskLevel: asset.riskLevel,
      maturity: asset.maturity,
      tier: asset.tier,
      stockVersion: asset.stockVersion,
      ownerId: asset.ownerId,
      originId: asset.originId,
    });
  }, [dataset, searchParams]);

  // Focus the Name field once the form has mounted, when it was opened by an
  // action that requested it (the empty-state CTA).
  useEffect(() => {
    if (formState === "open" && focusNameOnOpen.current) {
      focusNameOnOpen.current = false;
      nameInputRef.current?.focus();
    }
  }, [formState]);

  // Open the form and land focus on Name (used by the empty-state CTA).
  function openFormAndFocus() {
    focusNameOnOpen.current = true;
    setFormState("open");
  }

  async function submit() {
    const slug =
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (editing) {
      await updateAsset(editing.id, { ...input, slug });
      setMessage(`Updated ${input.name}`);
      setEditing(null);
      setSearchParams({});
    } else {
      await addAsset({ ...input, slug });
      setMessage(`Added ${input.name}`);
    }
    setInput(defaultInput);
  }

  function edit(asset: AssetRow) {
    setSearchParams({ edit: asset.id });
    setEditing(asset);
    setFormState("open");
    setInput({
      type: asset.type,
      name: asset.name,
      slug: asset.slug,
      description: asset.description,
      system: asset.system,
      body: asset.body,
      version: asset.version,
      status: asset.status,
      riskLevel: asset.riskLevel,
      maturity: asset.maturity,
      tier: asset.tier,
      stockVersion: asset.stockVersion,
      ownerId: asset.ownerId,
      originId: asset.originId,
    });
  }

  function resetForm() {
    setEditing(null);
    setInput(defaultInput);
    setMessage(null);
    setSearchParams({});
  }

  return (
    <div
      className={`grid min-w-0 gap-4 ${
        formState === "closed" ? "" : "2xl:grid-cols-[360px_minmax(0,1fr)]"
      }`}
    >
      {formState !== "closed" && (
        <CollapsibleCard
          collapsed={formState === "minimized"}
          onClose={() => setFormState("closed")}
          onToggleCollapse={() =>
            setFormState((state) =>
              state === "minimized" ? "open" : "minimized",
            )
          }
          title={editing ? "Edit asset" : "Add asset"}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-3">
              <div className="eyebrow">Identity</div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-fg"
                  htmlFor="asset-name"
                >
                  Name
                </label>
                <input
                  aria-label="Name"
                  className="field"
                  id="asset-name"
                  onChange={(event) =>
                    setInput({ ...input, name: event.target.value })
                  }
                  placeholder="Name"
                  ref={nameInputRef}
                  value={input.name}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-fg"
                  htmlFor="asset-slug"
                >
                  Slug
                </label>
                <input
                  aria-label="Slug"
                  className="field font-mono"
                  id="asset-slug"
                  onChange={(event) =>
                    setInput({ ...input, slug: event.target.value })
                  }
                  placeholder="Auto from name"
                  value={input.slug}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="eyebrow">Classification</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-fg"
                    htmlFor="asset-type"
                  >
                    Type
                  </label>
                  <select
                    aria-label="Type"
                    className="field"
                    id="asset-type"
                    onChange={(event) =>
                      setInput({
                        ...input,
                        type: event.target.value as AssetInput["type"],
                      })
                    }
                    value={input.type}
                  >
                    {[
                      "skill",
                      "subagent",
                      "prompt",
                      "mcp-server",
                      "hook",
                      "command",
                      "workflow",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-fg"
                    htmlFor="asset-tier"
                  >
                    Tier
                  </label>
                  <select
                    aria-label="Tier"
                    className="field"
                    id="asset-tier"
                    onChange={(event) =>
                      setInput({
                        ...input,
                        tier: event.target.value as AssetInput["tier"],
                      })
                    }
                    value={input.tier}
                  >
                    <option value="stock">stock</option>
                    <option value="custom">custom</option>
                    <option value="forked">forked</option>
                  </select>
                </div>
              </div>
              {input.tier === "forked" && (
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-fg"
                    htmlFor="asset-stock-version"
                  >
                    Stock version
                  </label>
                  <input
                    aria-label="Stock version"
                    className="field font-mono tabular-nums"
                    id="asset-stock-version"
                    onChange={(event) =>
                      setInput({ ...input, stockVersion: event.target.value })
                    }
                    placeholder="Stock version"
                    value={input.stockVersion ?? ""}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="eyebrow">Content</div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-fg"
                  htmlFor="asset-description"
                >
                  Description
                </label>
                <textarea
                  aria-label="Description"
                  className="field min-h-20"
                  id="asset-description"
                  onChange={(event) =>
                    setInput({ ...input, description: event.target.value })
                  }
                  placeholder="Description"
                  value={input.description}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-fg"
                  htmlFor="asset-body"
                >
                  Body
                </label>
                <textarea
                  aria-label="Body"
                  className="field min-h-32 font-mono text-xs"
                  id="asset-body"
                  onChange={(event) =>
                    setInput({ ...input, body: event.target.value })
                  }
                  placeholder="Body"
                  value={input.body}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary">
                {editing ? "Save changes" : "Add asset"}
              </Button>
              {editing && (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Cancel
                </Button>
              )}
            </div>
            {message && (
              <div className="text-sm text-success-fg" role="status">
                {message}
              </div>
            )}
          </form>
        </CollapsibleCard>
      )}

      <Panel
        action={
          dataset ? (
            <div className="flex items-center gap-2">
              {formState === "closed" && (
                <Button
                  onClick={() => setFormState("open")}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <span aria-hidden="true">+</span> Add asset
                </Button>
              )}
              <span className="eyebrow">
                {columnFilters.activeCount > 0
                  ? `${view.rows.length} of ${sorted.length} assets`
                  : `${sorted.length} assets`}
              </span>
            </div>
          ) : undefined
        }
        dense
        info="catalogue.table"
        title="Catalogue"
      >
        {loading || !dataset ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-8 w-full rounded-lg" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-12 w-full rounded-lg" key={index} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          dataset.assets.length > 0 ? (
            <EmptyState
              action={
                <Button
                  onClick={() => setFilters(defaultFilters)}
                  type="button"
                  variant="secondary"
                >
                  Clear filters
                </Button>
              }
              fill
              title="No matches"
            >
              No assets match the current filters. Clear them to see the full
              catalogue.
            </EmptyState>
          ) : (
            <EmptyState
              action={
                <Button
                  onClick={openFormAndFocus}
                  type="button"
                  variant="primary"
                >
                  Add asset
                </Button>
              }
              fill
              title="The Vault is empty"
            >
              No assets yet. Add your first one with the Add asset form.
            </EmptyState>
          )
        ) : (
          <>
            <ul
              aria-label="Mobile asset catalogue"
              className="space-y-3 md:hidden"
            >
              {sorted.map((asset) => {
                const origin = asset.originId
                  ? originById.get(asset.originId)
                  : undefined;
                const status = lifecyclePill(asset.status);
                const risk = riskPill(asset.riskLevel);
                return (
                  <li
                    className="rounded-lg border border-border bg-surface-raised p-3 shadow-card"
                    key={asset.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          className="font-medium text-fg hover:text-accent-strong"
                          to={`/asset/${asset.id}`}
                        >
                          {asset.name}
                        </Link>
                        <div className="truncate font-mono text-xs text-subtle">
                          {asset.slug}
                        </div>
                      </div>
                      <Pill severity={status.severity} tone={status.tone}>
                        {lifecycleOf(asset.status)}
                      </Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Pill tone="slate">{asset.type}</Pill>
                      <Pill tone={tierTone(asset.tier)}>{asset.tier}</Pill>
                      <Pill severity={risk.severity} tone={risk.tone}>
                        {asset.riskLevel} risk
                      </Pill>
                      {scopeOf(asset.status) && (
                        <Pill tone={scopeTone(scopeOf(asset.status)!)}>
                          {scopeOf(asset.status)}
                        </Pill>
                      )}
                      {signalById.get(asset.id) && (
                        <AssetStateBadge
                          state={signalById.get(asset.id)!.quadrant}
                          title={
                            classificationReason(
                              signalById.get(asset.id)!,
                              dataset,
                            ) ?? undefined
                          }
                        />
                      )}
                    </div>
                    <div className="mt-3">
                      <Meter
                        label={`${asset.name} maturity ${formatPercent(asset.maturity)}`}
                        showValue
                        tone="accent"
                        value={asset.maturity}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
                      <span className="truncate">
                        {origin?.name ?? "unknown origin"}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {formatDate(asset.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-1">
                      <Button
                        aria-label={`Edit ${asset.name}`}
                        onClick={() => edit(asset)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Edit
                      </Button>
                      <Button
                        aria-label={`Retire ${asset.name}`}
                        onClick={() => void retireAsset(asset.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Retire
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden min-w-0 md:block">
              <DataTable
                caption="Agentic asset library"
                minWidth={1180}
                stickyFirstColumn
              >
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Asset {view.filterFor("asset")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Type {view.filterFor("type")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Tier {view.filterFor("tier")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Risk {view.filterFor("risk")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1.5">
                        Maturity
                        <InfoTooltip
                          align="end"
                          label={TOOLTIPS["catalogue.maturity"]}
                          triggerLabel="About maturity"
                        />
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Status {view.filterFor("status")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Scope {view.filterFor("scope")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        State {view.filterFor("state")}
                      </span>
                    </th>
                    <th scope="col">
                      <span className="inline-flex items-center gap-1">
                        Origin {view.filterFor("origin")}
                      </span>
                    </th>
                    <th scope="col">Updated</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.length === 0 && (
                    <tr>
                      <td className="text-subtle" colSpan={11}>
                        No rows match the column filters.{" "}
                        <button
                          className="font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                          onClick={() => columnFilters.clearAll()}
                          type="button"
                        >
                          Clear column filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {view.rows.map((asset) => {
                    const origin = asset.originId
                      ? originById.get(asset.originId)
                      : undefined;
                    const status = lifecyclePill(asset.status);
                    const risk = riskPill(asset.riskLevel);
                    return (
                      <tr key={asset.id}>
                        <td className="max-w-[320px]">
                          <Link
                            className="font-medium text-fg hover:text-accent-strong"
                            to={`/asset/${asset.id}`}
                          >
                            {asset.name}
                          </Link>
                          <div className="truncate font-mono text-xs text-subtle">
                            {asset.slug}
                          </div>
                        </td>
                        <td className="whitespace-nowrap font-mono text-xs text-muted">
                          {asset.type}
                        </td>
                        <td>
                          <Pill tone={tierTone(asset.tier)}>{asset.tier}</Pill>
                        </td>
                        <td>
                          <Pill severity={risk.severity} tone={risk.tone}>
                            {asset.riskLevel}
                          </Pill>
                        </td>
                        <td className="min-w-[7rem]">
                          <Meter
                            label={`${asset.name} maturity ${formatPercent(asset.maturity)}`}
                            showValue
                            tone="accent"
                            value={asset.maturity}
                          />
                        </td>
                        <td>
                          <Pill severity={status.severity} tone={status.tone}>
                            {lifecycleOf(asset.status)}
                          </Pill>
                        </td>
                        <td>
                          <ScopeBadge status={asset.status} />
                        </td>
                        <td>
                          {signalById.get(asset.id) && (
                            <AssetStateBadge
                              state={signalById.get(asset.id)!.quadrant}
                              title={
                                classificationReason(
                                  signalById.get(asset.id)!,
                                  dataset,
                                ) ?? undefined
                              }
                            />
                          )}
                        </td>
                        <td className="text-xs">
                          {origin ? (
                            origin.url ? (
                              <a
                                className="text-muted hover:text-accent-strong"
                                href={origin.url}
                                rel="noreferrer noopener"
                                target="_blank"
                              >
                                {origin.name}
                                <span className="sr-only">
                                  {" "}
                                  (opens in a new tab)
                                </span>
                              </a>
                            ) : (
                              <span className="text-muted">{origin.name}</span>
                            )
                          ) : (
                            <span className="text-subtle">unknown</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap font-mono tabular-nums text-muted">
                          {formatDate(asset.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button
                              aria-label={`Edit ${asset.name}`}
                              onClick={() => edit(asset)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              aria-label={`Retire ${asset.name}`}
                              onClick={() => void retireAsset(asset.id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Retire
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
