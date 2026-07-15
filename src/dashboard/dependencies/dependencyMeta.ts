import { dependenciesOf, scoreAssets, type Quadrant } from "@/data/metrics";
import type { AssetRow, AssetStatus, VaultDataset } from "@/data/types";

import { QUADRANT_TONE, type NodeTone } from "@/dashboard/monitor/monitorMeta";

/**
 * The dependency graph is grained per asset that participates in a declared
 * "requires" relationship. dependencyNodes builds one node per participating asset
 * (or every asset when isolated nodes are included); dependencyEdges builds the
 * directed requires edges from the dependency table. Tone is the scoreAssets
 * quadrant, reused from monitorMeta so the legend matches the operational monitor.
 */

export interface DependencyNode {
  id: string;
  name: string;
  type: string;
  status: AssetStatus;
  quadrant: Quadrant;
  tone: NodeTone;
  /** How many assets this node requires (outbound edges). */
  requiresCount: number;
  /** How many assets require this node (inbound edges). */
  requiredByCount: number;
}

/** A directed edge: from = dependent (requires source), to = dependency. */
export interface DependencyEdge {
  id: string;
  from: string;
  to: string;
}

/**
 * Directed edges from the dependency table: from = assetId (the dependent),
 * to = dependsOnAssetId (the dependency). Self-edges and edges that point at an
 * unknown asset id are dropped, and the set is de-duplicated by a directed key so
 * the same from -> to pair is only drawn once.
 */
export function dependencyEdges(dataset: VaultDataset): DependencyEdge[] {
  const known = new Set(dataset.assets.map((asset) => asset.id));
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();
  for (const dependency of dataset.dependencies) {
    const from = dependency.assetId;
    const to = dependency.dependsOnAssetId;
    if (from === to || !known.has(from) || !known.has(to)) continue;
    const key = `dep:${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: key, from, to });
  }
  return edges;
}

/**
 * One node per asset. By default only assets that participate in at least one valid
 * dependency edge (both ends are known asset ids) are returned, so the graph stays
 * sparse and readable; includeIsolated returns one node per asset, including those
 * with no edges. Tone comes from the scoreAssets quadrant, defaulting to Dead
 * weight when an asset is somehow missing a score.
 */
export function dependencyNodes(
  dataset: VaultDataset,
  includeIsolated = false,
): DependencyNode[] {
  const scoreByAsset = new Map(
    scoreAssets(dataset).map((score) => [score.asset.id, score]),
  );

  const participating = new Set<string>();
  for (const edge of dependencyEdges(dataset)) {
    participating.add(edge.from);
    participating.add(edge.to);
  }

  const build = (asset: AssetRow): DependencyNode => {
    const quadrant = scoreByAsset.get(asset.id)?.quadrant ?? "Dead weight";
    const deps = dependenciesOf(dataset, asset.id);
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      quadrant,
      tone: QUADRANT_TONE[quadrant],
      requiresCount: deps.requires.length,
      requiredByCount: deps.requiredBy.length,
    };
  };

  return dataset.assets
    .filter((asset) => includeIsolated || participating.has(asset.id))
    .map(build);
}

/** The legend mapping each quadrant tone to its glyph and label. */
export const DEPENDENCY_LEGEND: {
  tone: NodeTone;
  glyph: string;
  label: string;
}[] = [
  { tone: "success", glyph: "star", label: "Star" },
  { tone: "danger", glyph: "alert", label: "Risk" },
  { tone: "warn", glyph: "flag", label: "Shelfware" },
  { tone: "muted", glyph: "dot", label: "Dead weight" },
];
