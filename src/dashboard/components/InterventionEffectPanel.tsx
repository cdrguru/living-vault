import type { InterventionEffectView, Verdict } from "@/data";
import { formatDate, formatNumber, formatPercent } from "@/dashboard/format";

import { Panel } from "./Panel";
import { Pill, type PillSeverity, type PillTone } from "./Pill";

const VERDICT_TONE: Record<Verdict, PillTone> = {
  improved: "green",
  regressed: "red",
  unchanged: "slate",
  inconclusive: "amber",
  stalled: "slate",
  deferred: "slate",
};

const VERDICT_SEVERITY: Record<Verdict, PillSeverity> = {
  improved: "good",
  regressed: "danger",
  unchanged: "neutral",
  inconclusive: "warn",
  stalled: "neutral",
  deferred: "neutral",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  improved: "improved",
  regressed: "regressed",
  unchanged: "unchanged",
  inconclusive: "measuring",
  stalled: "unmeasurable",
  deferred: "deferred",
};

/** A verdict is a measured result only when the evidence window was sufficient. */
const isMeasured = (verdict: Verdict): boolean =>
  verdict === "improved" || verdict === "unchanged" || verdict === "regressed";

/**
 * "Did the last change help?" for one asset. Renders the most recent intervention and the
 * gated verdict against the asset's current effectiveness. This is the UI half the closed
 * loop was missing: interventionEffect() has been tested since 2026-07-12, but nothing
 * rendered it. The sufficiency gate is enforced upstream in verdictOf, so this component
 * never shows a below-floor delta as a result: an insufficient window reads "measuring",
 * and the before/now numbers appear only for a measured verdict.
 */
export function InterventionEffectPanel({
  view,
}: {
  view: InterventionEffectView;
}) {
  const { verdict, intervention, delta, postChangeSample, requiredSample, scoreNow } =
    view;
  const before = intervention.effectiveScoreBefore;
  const measured = isMeasured(verdict);

  return (
    <Panel
      action={
        <Pill severity={VERDICT_SEVERITY[verdict]} tone={VERDICT_TONE[verdict]}>
          {VERDICT_LABEL[verdict]}
        </Pill>
      }
      title="Effect of the last change"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-fg">{intervention.outcome}</span> on{" "}
          <span className="font-mono tabular-nums">
            {formatDate(intervention.date)}
          </span>{" "}
          by <span className="font-mono">{intervention.actor}</span>
          {intervention.note ? (
            <>
              {" "}
              (&ldquo;{intervention.note}&rdquo;)
            </>
          ) : null}
          .
        </p>

        {measured && before !== null && scoreNow !== null && delta !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-semibold tabular-nums text-fg">
              {formatPercent(before)} &rarr; {formatPercent(scoreNow)}
            </span>
            <span
              className={`font-mono text-sm tabular-nums ${
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-danger"
                    : "text-subtle"
              }`}
            >
              ({delta >= 0 ? "+" : ""}
              {Math.round(delta * 100)}%)
            </span>
            <span className="text-xs text-subtle">
              across {formatNumber(postChangeSample)} post-change invocations
            </span>
          </div>
        ) : verdict === "deferred" ? (
          <p className="text-sm text-subtle">
            The agent deliberately did not act, so there is nothing to measure. A
            deferral is honored, then expires so a one-time &ldquo;not
            now&rdquo; cannot suppress the finding forever.
          </p>
        ) : verdict === "stalled" ? (
          <p className="text-sm text-subtle">
            Unmeasurable: only {formatNumber(postChangeSample)} of{" "}
            {formatNumber(requiredSample)} post-change invocations have
            accumulated, so the effect of this change cannot be judged.
          </p>
        ) : (
          <p className="text-sm text-subtle">
            Measuring: {formatNumber(postChangeSample)} of{" "}
            {formatNumber(requiredSample)} post-change invocations needed before
            the effect can be judged. A delta over a handful of calls is noise,
            not a result.
          </p>
        )}
      </div>
    </Panel>
  );
}
