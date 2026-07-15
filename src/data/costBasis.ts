import { harnessSpend, harnessSpendTotals } from "./harnessCost";
import { inWindow, totalCost, type DateWindow } from "./metrics";
import type { CodexBillingSnapshot, HarnessUsage, VaultDataset } from "./types";

/**
 * Which source backs the cost/spend figures for a given window.
 * - "utilization": per-asset Utilization carries real cost (or the modeled seed).
 * - "harness-estimate": no per-asset cost, but per-harness token spend is priced
 *   at list rate as an estimate.
 * - "none": neither has a cost figure for this window; pages render an empty state.
 */
export type CostBasis = "utilization" | "harness-estimate" | "none";

export interface CostBasisResult {
  basis: CostBasis;
  totalCost: number;
  totalSuccesses: number;
  costPerSuccess: number | null;
  /** True when the active basis is a real/modeled figure rather than an estimate. */
  tracked: boolean;
}

export interface CodexBillingComparison {
  hasBilling: boolean;
  actualCredits: number;
  billedTokens: number;
  localTokens: number;
  modeledSpend: number;
  tokenCoverage: number | null;
  windowStart: string | null;
  windowEnd: string | null;
}

export function compareCodexBilling(
  harnessUsage: HarnessUsage[],
  billing: CodexBillingSnapshot,
): CodexBillingComparison {
  const codex = harnessUsage.filter((usage) => usage.source === "codex");
  const modeled = harnessSpend(codex).reduce((sum, row) => sum + row.cost, 0);
  const actualCredits = billing.totals.credits;
  const billedTokens = billing.totals.billedTokens;
  const localTokens =
    billing.totals.localTokens ||
    codex.reduce((sum, usage) => sum + usage.tokens, 0);

  return {
    hasBilling: actualCredits > 0 || billedTokens > 0,
    actualCredits,
    billedTokens,
    localTokens,
    modeledSpend: modeled,
    tokenCoverage: billedTokens > 0 ? localTokens / billedTokens : null,
    windowStart: billing.windowStart,
    windowEnd: billing.windowEnd,
  };
}

/**
 * Single source of truth for the dashboard's cost headline, so the Overview cost
 * tile, the Cost page, and the Effectiveness empty-state all resolve the SAME
 * basis for the same window and never show contradictory figures (one populated,
 * one $0). Reuses totalCost() and harnessSpend()/harnessSpendTotals(); it does not
 * reimplement either. Pure.
 *
 * The cost-tracked gate uses `!== false` so a fresh seed load (no telemetryMeta)
 * still renders the modeled seed cost, matching the prior Overview behavior; once
 * real telemetry sets tracked.cost = false the utilization branch stops firing and
 * the estimate/none branches take over coherently across every page.
 */
export function selectCostBasis(
  dataset: VaultDataset,
  harnessUsage: HarnessUsage[],
  window?: DateWindow,
): CostBasisResult {
  const costTracked = dataset.telemetryMeta?.tracked.cost !== false;
  const utilizationCost = totalCost(dataset, window);
  if (costTracked && utilizationCost > 0) {
    const totalSuccesses = dataset.utilization.reduce(
      (sum, row) => (inWindow(row.date, window) ? sum + row.successes : sum),
      0,
    );
    return {
      basis: "utilization",
      totalCost: utilizationCost,
      totalSuccesses,
      costPerSuccess: totalSuccesses ? utilizationCost / totalSuccesses : null,
      tracked: true,
    };
  }

  const harness = harnessSpendTotals(harnessSpend(harnessUsage));
  if (harness.cost > 0) {
    return {
      basis: "harness-estimate",
      totalCost: harness.cost,
      totalSuccesses: harness.successes,
      costPerSuccess: harness.costPerSuccess,
      tracked: false,
    };
  }

  return {
    basis: "none",
    totalCost: 0,
    totalSuccesses: 0,
    costPerSuccess: null,
    tracked: false,
  };
}
