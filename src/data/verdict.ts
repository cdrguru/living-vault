import {
  interventionEffect,
  interventionHistory,
  type InterventionRow,
} from "./interventions";
import {
  EVIDENCE_WINDOW,
  isChangingOutcome,
  isDeferralActive,
  isStalled,
  isSufficient,
  postChangeSample,
} from "./evidenceWindow";

/**
 * Did the last change help? This is the module that closes the loop.
 *
 * Everything here was already possible and never done. `interventionEffect()` has
 * computed the before/after delta, and been tested, since 2026-07-12; until this file it
 * had no caller outside its own test, so the Vault recorded that an asset was revised,
 * froze what it looked like beforehand, and then never asked the question those two facts
 * exist to answer.
 *
 * A verdict is not a delta. A delta is a subtraction, and a subtraction over three
 * invocations is noise. A verdict is a delta that has passed a sufficiency gate and a
 * noise band, or an honest admission that it has not.
 *
 * Pure: no I/O, no clock.
 */

export type Verdict =
  /** Measurably better since the change. */
  | "improved"
  /** Measurably worse since the change. The change should be revisited. */
  | "regressed"
  /** Enough evidence to judge, and the change moved nothing outside the noise band. */
  | "unchanged"
  /** Not enough post-change evidence yet. Still measuring. NOT a result. */
  | "inconclusive"
  /** Open a long time and still not enough evidence. Terminal. NOT a result. */
  | "stalled"
  /** The agent deliberately did not act, so there is nothing to measure. */
  | "deferred";

export interface VerdictResult {
  verdict: Verdict;
  /** The intervention this verdict is about. */
  intervention: InterventionRow;
  /**
   * effectiveScoreNow - effectiveScoreBefore, or null when it cannot be computed
   * honestly. Present on `inconclusive` for display ("6 of 20, currently +0.04"), but a
   * caller MUST NOT treat a delta as a result unless the verdict says so.
   */
  delta: number | null;
  /** Invocations accumulated since the change. */
  postChangeSample: number;
  /** How many are needed before a delta is allowed to become a verdict. */
  requiredSample: number;
}

/**
 * The band within which a delta is `unchanged` rather than a movement.
 *
 * PROVISIONAL, like every threshold here. Without a band, every window closes as
 * `improved` or `regressed` and the verdict carries no information: effectiveness drifts
 * by small amounts for reasons that have nothing to do with the edit (a different mix of
 * tasks, a model change, a quiet week). A band is what makes "unchanged" sayable.
 */
export const UNCHANGED_BAND = 0.05;

/**
 * Effectiveness deltas are compared at the precision they are reported at (4 places, the
 * same convention as `round` in recommend.ts).
 *
 * Not cosmetic. Binary floating point makes 0.55 - 0.5 = 0.05000000000000004, so a delta
 * sitting exactly on the band edge compares as OUTSIDE it and a movement of nothing gets
 * called an improvement. Rounding first makes the band mean what it says.
 */
const DELTA_PLACES = 4;
const roundDelta = (n: number): number => {
  const f = 10 ** DELTA_PLACES;
  return Math.round(n * f) / f;
};

/**
 * The verdict on the most recent intervention for an asset, or null when the asset has
 * never been acted on (which is not a verdict, it is the absence of one).
 *
 * The gate order is deliberate and each step is a refusal to overclaim:
 *   1. No intervention at all -> null. Nothing happened; say nothing.
 *   2. The agent deferred -> `deferred`. Nothing changed; there is nothing to measure.
 *   3. Not enough post-change evidence -> `inconclusive`, or `stalled` if it has been
 *      open too long. A delta may exist; it is not yet allowed to mean anything.
 *   4. Enough evidence but no before-score or no after-score -> `inconclusive`. This
 *      mirrors interventionEffect()'s own discipline: returning null rather than
 *      guessing is the point.
 *   5. Only now, a real verdict.
 */
export function verdictOf(
  rows: InterventionRow[],
  assetId: string,
  effectiveScoreNow: number | null,
  invocationsNow: number,
  refDate: number,
): VerdictResult | null {
  const history = interventionHistory(rows, assetId);
  const last = history[history.length - 1];
  if (!last) return null;

  const sample = postChangeSample(last, invocationsNow);
  const base = {
    intervention: last,
    postChangeSample: sample,
    requiredSample: 0,
  };

  // 2. A deferral is a decision not to act. There is no change to measure.
  if (!isChangingOutcome(last)) {
    return { ...base, verdict: "deferred", delta: null };
  }

  const effect = interventionEffect(rows, assetId, effectiveScoreNow);
  const delta = effect ? roundDelta(effect.delta) : null;
  const withSample = {
    ...base,
    delta,
    requiredSample: EVIDENCE_WINDOW.MIN_POST_CHANGE_SAMPLE,
  };

  // 3. Not enough evidence yet, or never going to be.
  if (!isSufficient(last, invocationsNow)) {
    return {
      ...withSample,
      verdict: isStalled(last, invocationsNow, refDate) ? "stalled" : "inconclusive",
    };
  }

  // 4. Enough invocations, but the comparison itself is unavailable. interventionEffect
  //    returns null when the before-score or the after-score is missing, and a missing
  //    score is not a zero score.
  if (delta === null) {
    return { ...withSample, verdict: "inconclusive" };
  }

  // 5. A real verdict.
  if (Math.abs(delta) <= UNCHANGED_BAND) {
    return { ...withSample, verdict: "unchanged" };
  }
  return { ...withSample, verdict: delta > 0 ? "improved" : "regressed" };
}

/** Is this verdict a measured result, or an admission that we cannot say? */
export const isMeasured = (verdict: Verdict): boolean =>
  verdict === "improved" || verdict === "regressed" || verdict === "unchanged";

/**
 * Should this asset stay out of the actionable worklist?
 *
 * True while a change is still being measured, after a change that worked, and while a
 * deliberate deferral is honored. False for a regression (that is the whole point) and
 * false for `unchanged` (the change did not help, so the original finding stands).
 */
export function suppressesReproposal(
  result: VerdictResult,
  refDate: number,
): boolean {
  switch (result.verdict) {
    case "inconclusive":
      return true;
    case "improved":
      return true;
    case "deferred":
      return isDeferralActive(result.intervention, refDate);
    case "regressed":
    case "unchanged":
    case "stalled":
      return false;
  }
}
