import {
  bundlesOf,
  dependenciesOf,
  duplicateClusters,
  scoreAssets,
  type AssetScore,
  type Quadrant,
} from "@/data/metrics";
import type { VaultDataset } from "@/data/types";

/**
 * The asset-topology canvas reuses the model engine's geometry and gestures but
 * is grained per asset, not per database table. modelMeta describes the schema
 * (Asset, Owner, Tag, ...); monitorMeta describes the operational graph (one node
 * per dataset.assets row, edges from metrics.ts). The two never share a layout
 * key, so the /monitor map cannot clobber the /model map.
 */

/** A node tone keyed to a scoreAssets quadrant. Tone carries shape and icon too, never color alone. */
export type NodeTone = "success" | "danger" | "warn" | "muted";

/** The five edge kinds the monitor draws, each from a metrics.ts source. */
export type MonitorEdgeKind = "requires" | "member-of" | "tagged" | "duplicate";

export interface MonitorNode {
  id: string;
  name: string;
  type: string;
  quadrant: Quadrant;
  tone: NodeTone;
  /** Inbound dependency fan-in, the count of assets that require this one. */
  requiredByCount: number;
  /** Windowed invocations come from the live signal, not this static meta. */
  score: AssetScore;
}

export interface MonitorEdge {
  id: string;
  kind: MonitorEdgeKind;
  from: string;
  to: string;
  dashed: boolean;
}

/** Quadrant to node tone. Stars success, Risks danger, Shelfware warn, Dead weight muted. */
export const QUADRANT_TONE: Record<Quadrant, NodeTone> = {
  Stars: "success",
  Risks: "danger",
  Shelfware: "warn",
  "Dead weight": "muted",
};

/** A short glyph for each tone so the legend and the node both read without color. */
export const TONE_GLYPH: Record<NodeTone, string> = {
  success: "star",
  danger: "alert",
  warn: "flag",
  muted: "dot",
};

/** Build one node per asset, colored by the scoreAssets quadrant. */
export function monitorNodes(dataset: VaultDataset): MonitorNode[] {
  const scores = scoreAssets(dataset);
  return scores.map((score) => ({
    id: score.asset.id,
    name: score.asset.name,
    type: score.asset.type,
    quadrant: score.quadrant,
    tone: QUADRANT_TONE[score.quadrant],
    requiredByCount: dependenciesOf(dataset, score.asset.id).requiredBy.length,
    score,
  }));
}

/**
 * Build the operational edges straight from metrics. requires edges from
 * dependenciesOf (solid), member-of from bundlesOf (solid), tagged from a shared
 * tagId in assetTags (dashed, gated by a toggle in the UI), and duplicate from
 * duplicateClusters (dashed, warn-toned). Edges are de-duplicated by an undirected
 * key per kind so a pair is only drawn once.
 */
export function monitorEdges(dataset: VaultDataset): MonitorEdge[] {
  const nodeIds = new Set(dataset.assets.map((asset) => asset.id));
  const edges: MonitorEdge[] = [];
  const seen = new Set<string>();

  const add = (
    kind: MonitorEdgeKind,
    a: string,
    b: string,
    dashed: boolean,
  ) => {
    if (a === b || !nodeIds.has(a) || !nodeIds.has(b)) return;
    const undirected = a < b ? `${a}|${b}` : `${b}|${a}`;
    const key = `${kind}:${undirected}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: key, kind, from: a, to: b, dashed });
  };

  // requires: assetId depends on dependsOnAssetId. Directed source to target.
  for (const dependency of dataset.dependencies) {
    add("requires", dependency.assetId, dependency.dependsOnAssetId, false);
  }

  // member-of: assets that share a bundle are linked through that bundle.
  for (const asset of dataset.assets) {
    const bundles = bundlesOf(dataset, asset.id);
    for (const bundle of bundles) {
      const members = dataset.bundleMemberships
        .filter((row) => row.bundleId === bundle.id)
        .map((row) => row.assetId);
      for (const other of members) add("member-of", asset.id, other, false);
    }
  }

  // tagged: assets that share at least one tag. Dashed and toggled in the UI.
  const tagsByAsset = new Map<string, Set<string>>();
  for (const row of dataset.assetTags) {
    tagsByAsset.set(
      row.assetId,
      new Set([...(tagsByAsset.get(row.assetId) ?? []), row.tagId]),
    );
  }
  const assetIds = [...tagsByAsset.keys()];
  for (let i = 0; i < assetIds.length; i += 1) {
    for (let j = i + 1; j < assetIds.length; j += 1) {
      const a = assetIds[i];
      const b = assetIds[j];
      const tagsA = tagsByAsset.get(a)!;
      const tagsB = tagsByAsset.get(b)!;
      const shares = [...tagsA].some((tagId) => tagsB.has(tagId));
      if (shares) add("tagged", a, b, true);
    }
  }

  // duplicate: assets in the same content-hash cluster, warn toned and dashed.
  for (const cluster of duplicateClusters(dataset)) {
    for (let i = 0; i < cluster.length; i += 1) {
      for (let j = i + 1; j < cluster.length; j += 1) {
        add("duplicate", cluster[i].id, cluster[j].id, true);
      }
    }
  }

  return edges;
}

/** The legend entries describing every edge kind. */
export const EDGE_LEGEND: {
  kind: MonitorEdgeKind;
  label: string;
  dashed: boolean;
}[] = [
  { kind: "requires", label: "Requires or required by", dashed: false },
  { kind: "member-of", label: "Member of a shared bundle", dashed: false },
  { kind: "tagged", label: "Shares a tag", dashed: true },
  { kind: "duplicate", label: "Duplicate content", dashed: true },
];
