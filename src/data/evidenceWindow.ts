import type { InterventionRow } from "./interventions";

/**
 * The post-change evidence window: how much evidence has accumulated SINCE an agent
 * changed an asset, and whether it is yet enough to say anything.
 *
 * This module exists because the raw material was already being written and never read.
 * `InterventionRow` freezes `invocationsBefore` at the moment of the intervention, which
 * makes the window boundary a subtraction: everything after that count is post-change
 * evidence. Nothing computed it until now.
 *
 * Pure: no I/O, no clock. The reference date is passed in, the same way the rest of
 * recommend.ts treats time, so a worklist is reproducible from its inputs.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Thresholds. PROVISIONAL, in exactly the sense RECOMMEND in recommend.ts is provisional:
 * these are legible first-pass defaults, not values derived from evidence about this
 * practitioner's fleet. Nobody has yet measured how many post-change invocations are
 * needed before a delta stops being noise.
 *
 * MIN_POST_CHANGE_SAMPLE deliberately matches MIN_SAMPLE in metrics.ts (20). A window is
 * measuring the same quantity the effectiveness grade measures, so demanding a different
 * sample for it would be asserting a distinction nobody has evidence for.
 *
 * Retune only against recorded outcomes: once enough windows have closed, the honest
 * question is which threshold would have separated the real improvements from the noise,
 * and that is the point at which these numbers should move.
 */
export const EVIDENCE_WINDOW = {
  /** Post-change invocations needed before a delta is allowed to become a verdict. */
  MIN_POST_CHANGE_SAMPLE: 20,
  /** After this long with an insufficient sample, the window is stalled, not pending. */
  MAX_WINDOW_DAYS: 90,
  /**
   * A deliberate `deferred` outcome is honored for this long. It expires so that a
   * one-time "not now" cannot suppress an asset forever: the reason an agent deferred in
   * March may not hold in June, and a suppression with no expiry is indistinguishable
   * from a dropped finding.
   */
  DEFER_HONORED_DAYS: 90,
} as const;

/**
 * Outcomes that actually CHANGED the asset, and therefore open a window.
 *
 * `deferred` is excluded on purpose: the agent looked and chose not to act, so there is
 * no before/after to measure. Treating it as a window would manufacture a delta out of
 * an asset nobody touched, and then attribute that delta to a change that never happened.
 */
const CHANGING_OUTCOMES = new Set(["revised", "retired", "merged", "promoted"]);

export const isChangingOutcome = (row: InterventionRow): boolean =>
  CHANGING_OUTCOMES.has(row.outcome);

/**
 * Evidence accumulated since the intervention.
 *
 * Clamped at zero: an asset whose telemetry window has rolled forward can report fewer
 * invocations now than were frozen then, and a negative sample is not a small sample, it
 * is a broken comparison. Zero says "nothing to go on", which is the honest reading.
 */
export function postChangeSample(
  intervention: InterventionRow,
  invocationsNow: number,
): number {
  return Math.max(0, invocationsNow - intervention.invocationsBefore);
}

/** Is there enough post-change evidence to allow a verdict at all? */
export function isSufficient(
  intervention: InterventionRow,
  invocationsNow: number,
): boolean {
  return (
    postChangeSample(intervention, invocationsNow) >=
    EVIDENCE_WINDOW.MIN_POST_CHANGE_SAMPLE
  );
}

/** Days since the intervention, relative to the caller's reference date. */
export function windowAgeDays(
  intervention: InterventionRow,
  refDate: number,
): number {
  const opened = Date.parse(intervention.date);
  if (!Number.isFinite(opened)) return 0;
  return Math.max(0, Math.round((refDate - opened) / MS_PER_DAY));
}

/**
 * A window that has been open a long time and still has not filled.
 *
 * This is a terminal, honest state, not an error. The asset was changed and then barely
 * used, so the change cannot be judged. The alternative, waiting forever, would leave the
 * asset silently suppressed; the other alternative, judging it on 3 invocations, would be
 * noise dressed as evidence.
 */
export function isStalled(
  intervention: InterventionRow,
  invocationsNow: number,
  refDate: number,
): boolean {
  return (
    !isSufficient(intervention, invocationsNow) &&
    windowAgeDays(intervention, refDate) > EVIDENCE_WINDOW.MAX_WINDOW_DAYS
  );
}

/** Is a deliberate deferral still within the period it is honored for? */
export function isDeferralActive(
  intervention: InterventionRow,
  refDate: number,
): boolean {
  return (
    intervention.outcome === "deferred" &&
    windowAgeDays(intervention, refDate) <= EVIDENCE_WINDOW.DEFER_HONORED_DAYS
  );
}
