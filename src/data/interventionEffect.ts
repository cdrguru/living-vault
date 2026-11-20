import { scoreAsset, utilizationByAsset } from "./metrics";
import { referenceDate } from "./referenceDate";
import type { VaultDataset } from "./types";
import { verdictOf, type VerdictResult } from "./verdict";

/**
 * The "did the last change help?" view model for one asset, for the Asset Detail panel.
 *
 * This is the UI read-side of the closed loop: it turns the frozen before-measurement on
 * the most recent intervention into a gated verdict against the asset's CURRENT score. It
 * is pure and read-only, so it is safe to show regardless of the VAULT_LIFECYCLE flag
 * (that flag governs whether the WORKLIST acts on verdicts, not whether the dashboard
 * displays them). Returns null when the asset has never been acted on, i.e. when there is
 * nothing to render.
 *
 * The sufficiency gate lives in verdictOf: a one-invocation delta comes back as
 * `inconclusive`, never as a result, so the panel can never render noise as evidence.
 */
export interface InterventionEffectView extends VerdictResult {
  /** The asset's current effective score, for the "before -> now" line. */
  scoreNow: number | null;
}

export function assetInterventionEffect(
  dataset: VaultDataset,
  assetId: string,
): InterventionEffectView | null {
  const asset = dataset.assets.find((row) => row.id === assetId);
  if (!asset) return null;
  const score = scoreAsset(asset, dataset, utilizationByAsset(dataset));
  const result = verdictOf(
    dataset.interventions,
    assetId,
    score.effectiveScore,
    score.usage.invocations,
    referenceDate(dataset),
  );
  if (!result) return null;
  return { ...result, scoreNow: score.effectiveScore };
}
