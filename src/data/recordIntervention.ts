import type { RecordInterventionInput } from "./DataSource";
import {
  appendIntervention,
  buildInterventionInput,
  type InterventionRow,
} from "./interventions";
import { scoreAssets } from "./metrics";
import { currentRevisionOf } from "./revisions";
import type { VaultDataset } from "./types";

/**
 * The shared "freeze the before-measurement and append" logic behind every data source's
 * recordIntervention. Pure over a dataset: it does no I/O, so each source calls it to
 * build the candidate, then persists in its own way.
 *
 * It resolves the asset's CURRENT score (effectiveness + invocations) and current
 * revision from the dataset, exactly as the MCP/CLI already do, so "did the change help?"
 * is answerable later from a frozen point. Rejects an unknown assetId: a typo'd id would
 * write a permanent orphan the loop could never join to an asset.
 */
export function freezeInterventionRow(
  dataset: VaultDataset,
  input: RecordInterventionInput,
  opts: { id?: string; recordedAt?: string } = {},
): InterventionRow {
  const score = scoreAssets(dataset).find((s) => s.asset.id === input.assetId);
  if (!score) throw new Error(`Unknown asset "${input.assetId}"`);
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const revisionIdBefore = currentRevisionOf(
    score.asset,
    dataset.assetRevisions,
  )?.id;
  return buildInterventionInput({
    tenantId: score.asset.tenantId,
    assetId: input.assetId,
    action: input.action,
    outcome: input.outcome,
    actor: input.actor,
    ...(input.note ? { note: input.note } : {}),
    date,
    effectiveScoreBefore: score.effectiveScore,
    invocationsBefore: score.usage.invocations,
    ...(revisionIdBefore ? { revisionIdBefore } : {}),
    ...(opts.id ? { id: opts.id } : {}),
    ...(opts.recordedAt ? { recordedAt: opts.recordedAt } : {}),
  });
}

/** Outcome of applying a freeze to a dataset's interventions. */
export interface AppliedIntervention {
  /** The interventions array after the append (may be the input array on a no-op). */
  interventions: InterventionRow[];
  /** The row now representing this decision in the store (appended, or the pre-existing
   *  match on an idempotent no-op). */
  persisted: InterventionRow;
  /** True when the append changed nothing (an identical re-record). */
  noop: boolean;
}

/** Freeze and append in one step, reporting exactly what changed so a data source can
 *  persist only the delta (the Fabric writer creates just the new row). */
export function applyIntervention(
  dataset: VaultDataset,
  input: RecordInterventionInput,
  opts: { id?: string; recordedAt?: string } = {},
): AppliedIntervention {
  const frozen = freezeInterventionRow(dataset, input, opts);
  const next = appendIntervention(dataset.interventions, frozen);
  if (next === dataset.interventions) {
    // No-op: return the pre-existing latest row with this dedupeKey.
    const existing = [...dataset.interventions]
      .reverse()
      .find((r) => r.dedupeKey === frozen.dedupeKey);
    return { interventions: next, persisted: existing ?? frozen, noop: true };
  }
  // The appended row carries frozen.id (appendIntervention preserves it, adding only
  // supersedesId), so it is findable by id.
  const persisted = next.find((r) => r.id === frozen.id) ?? frozen;
  return { interventions: next, persisted, noop: false };
}
