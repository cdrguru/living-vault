/**
 * Evidence classes for effectiveness signals. The rubric behind the metric
 * redesign (docs/superpowers/plans/2026-07-17-frontier-ecosystem-5-of-5-plan.md,
 * section 11) requires that the KIND of evidence behind a score is kept
 * separate and inspectable: a non-erroring tool call, a graded eval outcome, a
 * business result, and a controlled counterfactual are different classes of
 * claim and must never be conflated under one label. Every scoring signal in
 * metrics.ts declares exactly one class here; evidenceClass.test.ts pins the
 * registry as total over both scoring paths.
 */
export type EvidenceClass =
  | "operational-telemetry"
  | "customer-eval"
  | "business-outcome"
  | "counterfactual";

/**
 * Every signal id either scoring path uses (the legacy effectiveScore path and
 * the AES path), plus the signals the metric redesign introduces. Kept as a
 * closed union so the registry below cannot silently miss one.
 */
export type DeclaredSignalId =
  // Legacy effectiveScore path (metrics.effectivenessSignals).
  | "toolCallReliability"
  | "adoption"
  | "retention"
  | "evalPassRate"
  // AES path (metrics.scoreFromSignals).
  | "reliability"
  | "errorResistance"
  | "latencyQuality"
  // The counterfactual override (metrics.scoreFromSignals counterfactual
  // input). Declared for completeness; it stays null in production
  // (scoreAssetDetailed) until a real no-asset-control Baseline exists.
  | "counterfactual";

/**
 * The single evidence class each signal carries.
 *
 * toolCallReliability is operational telemetry BY DEFINITION: it measures
 * whether tool calls returned without error (tool_result.is_error === false),
 * which says the asset runs cleanly and says nothing about whether the task
 * succeeded. That is exactly why it must not be named quality and why its
 * class is not customer-eval.
 */
export const EVIDENCE_CLASS_BY_SIGNAL: Record<DeclaredSignalId, EvidenceClass> =
  {
    toolCallReliability: "operational-telemetry",
    adoption: "operational-telemetry",
    retention: "operational-telemetry",
    evalPassRate: "customer-eval",
    reliability: "operational-telemetry",
    errorResistance: "operational-telemetry",
    latencyQuality: "operational-telemetry",
    counterfactual: "counterfactual",
  };

/** The class of one signal id. Total by construction over DeclaredSignalId. */
export function evidenceClassOf(id: DeclaredSignalId): EvidenceClass {
  return EVIDENCE_CLASS_BY_SIGNAL[id];
}
