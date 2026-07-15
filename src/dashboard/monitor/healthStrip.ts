import {
  duplicateClusters,
  effectiveAssetRate,
  scoreAssets,
  type Quadrant,
} from "@/data/metrics";
import type { VaultDataset } from "@/data/types";

import type { NodeTone } from "./monitorMeta";

/**
 * The clickable health strip. Each tile is a cohort: a label, a value, a tone, and
 * the set of asset ids it selects so pressing the tile dims every non-matching node
 * on the canvas. Cost, tokens, and refusals are omitted entirely from this strip,
 * per the honesty rule. Some tiles (the contract-violation tile) select no nodes;
 * pressing them is still a valid no-cohort highlight.
 */

export type TileId =
  | "effective-rate"
  | "stars"
  | "risks"
  | "shelfware"
  | "dead-weight"
  | "stale"
  | "duplicates"
  | "violations";

export interface HealthTile {
  id: TileId;
  label: string;
  value: string;
  detail?: string;
  tone: NodeTone | "neutral";
  /** The asset ids this cohort highlights. Empty means the tile selects no nodes. */
  matchingIds: string[];
}

/**
 * Build every tile from the dataset. The effective-rate tile carries the headline
 * percentage and selects the Stars cohort; the four quadrant tiles select their
 * quadrant; stale selects stale assets; duplicates selects every asset in a
 * duplicate cluster; violations carries the contract-violation count and selects
 * no nodes (a violation is a row issue, not an asset cohort).
 */
export function healthTiles(
  dataset: VaultDataset,
  violationCount: number,
): HealthTile[] {
  const scores = scoreAssets(dataset);
  const idsInQuadrant = (quadrant: Quadrant) =>
    scores
      .filter((score) => score.quadrant === quadrant)
      .map((score) => score.asset.id);
  const staleIds = scores
    .filter((score) => score.stale)
    .map((score) => score.asset.id);
  const duplicateIds = duplicateClusters(dataset).flatMap((group) =>
    group.map((asset) => asset.id),
  );

  const stars = idsInQuadrant("Stars");
  const risks = idsInQuadrant("Risks");
  const shelfware = idsInQuadrant("Shelfware");
  const deadWeight = idsInQuadrant("Dead weight");

  const pct = (value: number) => `${Math.round(value * 100)}%`;

  return [
    {
      id: "effective-rate",
      label: "Star Rate",
      value: pct(effectiveAssetRate(dataset)),
      detail: `${stars.length} of ${dataset.assets.length}`,
      tone: "success",
      matchingIds: stars,
    },
    {
      id: "stars",
      label: "Stars",
      value: String(stars.length),
      tone: "success",
      matchingIds: stars,
    },
    {
      id: "risks",
      label: "Risks",
      value: String(risks.length),
      tone: "danger",
      matchingIds: risks,
    },
    {
      id: "shelfware",
      label: "Shelfware",
      value: String(shelfware.length),
      tone: "warn",
      matchingIds: shelfware,
    },
    {
      id: "dead-weight",
      label: "Dead weight",
      value: String(deadWeight.length),
      tone: "muted",
      matchingIds: deadWeight,
    },
    {
      id: "stale",
      label: "Stale",
      value: String(staleIds.length),
      tone: "warn",
      matchingIds: staleIds,
    },
    {
      id: "duplicates",
      label: "Duplicate clusters",
      value: String(duplicateClusters(dataset).length),
      tone: "warn",
      matchingIds: duplicateIds,
    },
    {
      id: "violations",
      label: "Contract violations",
      value: String(violationCount),
      tone: violationCount > 0 ? "danger" : "success",
      matchingIds: [],
    },
  ];
}
