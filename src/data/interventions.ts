import type {
  InterventionAction,
  InterventionOutcome,
  InterventionRow,
} from "./types";

export type { InterventionAction, InterventionOutcome, InterventionRow };

/**
 * Intervention history: what an agent actually DID about a recommendation.
 *
 * This is the half of the loop that makes the Vault a feedback system rather than a
 * dashboard: you cannot answer "did revising that skill help?" if you never recorded
 * that it was revised, or when. `interventionEffect()` below turns a record into a
 * before/after delta, and `verdict.ts` turns that delta into a verdict that
 * `recommend.ts` acts on when `RecommendOptions.lifecycle` is on.
 *
 * As of PR5 (2026-07-17) the row type lives in types.ts and is a first-class
 * VaultDataset member and Fabric entity, so a backup or a Fabric deploy preserves it;
 * before that it existed only in the gitignored src/data/imports/interventions.local.json
 * sidecar. That sidecar remains the write target for the local MCP/CLI agent loop; the
 * deployed app writes through the DataSource seam (recordIntervention).
 *
 * GENUINELY append-only now, unlike the prior upsert: `appendIntervention` never
 * destroys a row. A re-record with the same `dedupeKey` and an identical decision is an
 * idempotent no-op; a DIFFERENT decision (a same-day change of mind, deferred -> retired)
 * appends a new row and links `supersedesId` to the one it replaces, so the older row's
 * frozen `effectiveScoreBefore` survives. This module never stores the diff, the source,
 * or the agent's reasoning transcript.
 */

/** The old deterministic key, now a NON-unique grouping key (`assetId:date:action`). */
export function interventionDedupeKey(
  assetId: string,
  date: string,
  action: InterventionAction,
): string {
  return `${assetId}:${date}:${action}`;
}

/** Two records describe the same DECISION when their meaningful fields agree. The frozen
 *  before-measurements are excluded on purpose: a re-run captures fresh scores but it is
 *  still the same decision, and the FIRST record's before-score is the authoritative one. */
function sameDecision(a: InterventionRow, b: InterventionRow): boolean {
  return (
    a.outcome === b.outcome &&
    a.actor === b.actor &&
    (a.note ?? "") === (b.note ?? "")
  );
}

const byRecordedAtThenId = (a: InterventionRow, b: InterventionRow): number =>
  a.recordedAt === b.recordedAt
    ? a.id < b.id
      ? -1
      : 1
    : a.recordedAt < b.recordedAt
      ? -1
      : 1;

/**
 * Add an intervention. Append-only: nothing is ever removed.
 *
 * - Same `dedupeKey`, same decision as the latest such row: an idempotent no-op (an
 *   agent re-reporting the same change), returning the input array unchanged.
 * - Same `dedupeKey`, DIFFERENT decision: append the new row with `supersedesId` set to
 *   the latest prior row, so the change of mind is recorded and the old before-score
 *   survives.
 * - New `dedupeKey`: append.
 *
 * Pure: returns a new array (or the same array on a no-op).
 */
export function appendIntervention(
  rows: InterventionRow[],
  incoming: InterventionRow,
): InterventionRow[] {
  const priors = rows
    .filter((r) => r.dedupeKey === incoming.dedupeKey)
    .sort(byRecordedAtThenId);
  const prior = priors[priors.length - 1];
  if (prior && sameDecision(prior, incoming)) return rows;
  const linked = prior ? { ...incoming, supersedesId: prior.id } : incoming;
  return [...rows, linked].sort(byRecordedAtThenId);
}

/**
 * Build a fully-formed InterventionRow from a raw decision plus the frozen before-scores.
 *
 * Shared by every write path (the MCP `record_outcome`, the `vault-record-outcome` CLI,
 * and the DataSource `recordIntervention`) so the row is constructed in exactly one
 * place. Mints a uuid `id` and a `recordedAt` timestamp; `id`/`recordedAt` are injectable
 * so tests can be deterministic. Uses `globalThis.crypto`, available in the browser, in
 * Node 19+, and under tsx.
 */
export interface InterventionInput {
  tenantId: string;
  assetId: string;
  action: InterventionAction;
  outcome: InterventionOutcome;
  actor: string;
  note?: string;
  date: string;
  effectiveScoreBefore: number | null;
  invocationsBefore: number;
  revisionIdBefore?: string;
  /** Test seams: default to a fresh uuid and the current time. */
  id?: string;
  recordedAt?: string;
}

export function buildInterventionInput(input: InterventionInput): InterventionRow {
  return {
    id: input.id ?? globalThis.crypto.randomUUID(),
    tenantId: input.tenantId,
    assetId: input.assetId,
    ...(input.revisionIdBefore ? { revisionIdBefore: input.revisionIdBefore } : {}),
    date: input.date,
    action: input.action,
    outcome: input.outcome,
    actor: input.actor,
    ...(input.note ? { note: input.note } : {}),
    effectiveScoreBefore: input.effectiveScoreBefore,
    invocationsBefore: input.invocationsBefore,
    dedupeKey: interventionDedupeKey(input.assetId, input.date, input.action),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

/** The most recent intervention per asset, so the worklist can show prior action. */
export function latestInterventionByAsset(
  rows: InterventionRow[],
): Map<string, InterventionRow> {
  const latest = new Map<string, InterventionRow>();
  for (const row of rows) {
    const current = latest.get(row.assetId);
    if (!current || row.recordedAt > current.recordedAt) {
      latest.set(row.assetId, row);
    }
  }
  return latest;
}

/** One asset's interventions, oldest first (by recordedAt). */
export function interventionHistory(
  rows: InterventionRow[],
  assetId: string,
): InterventionRow[] {
  return rows.filter((row) => row.assetId === assetId).sort(byRecordedAtThenId);
}

/**
 * Did the intervention help? Compares the effectiveness captured AT the intervention
 * against the asset's effectiveness now.
 *
 * Returns null when it cannot be answered honestly: no prior intervention, no
 * before-score, or no after-score. That null is the point. A verdict of "improved"
 * on one invocation would be noise dressed as evidence, so callers must gate on
 * evidence sufficiency before showing a delta.
 */
export function interventionEffect(
  rows: InterventionRow[],
  assetId: string,
  effectiveScoreNow: number | null,
): { intervention: InterventionRow; delta: number } | null {
  const history = interventionHistory(rows, assetId);
  const last = history[history.length - 1];
  if (!last) return null;
  if (last.effectiveScoreBefore === null || effectiveScoreNow === null) return null;
  return {
    intervention: last,
    delta: effectiveScoreNow - last.effectiveScoreBefore,
  };
}

/**
 * Upgrade one persisted row to the current shape. Version-1 sidecar rows (written by the
 * MCP/CLI before PR5) carry the old deterministic `id` and lack `tenantId`, `dedupeKey`,
 * and `recordedAt`. Derive them: the old id IS the dedupeKey, `recordedAt` is midnight of
 * the record's date (the finest timestamp a v1 row implies), and the tenant defaults to
 * the caller's. Pure and idempotent: a row already carrying the fields is returned as-is.
 */
export function upgradeInterventionRow(
  raw: Record<string, unknown>,
  defaultTenantId: string,
): InterventionRow | null {
  if (typeof raw.assetId !== "string" || typeof raw.date !== "string") return null;
  const action = raw.action as InterventionAction;
  const dedupeKey =
    typeof raw.dedupeKey === "string"
      ? raw.dedupeKey
      : interventionDedupeKey(raw.assetId, raw.date, action);
  return {
    id: typeof raw.id === "string" ? raw.id : dedupeKey,
    tenantId: typeof raw.tenantId === "string" ? raw.tenantId : defaultTenantId,
    assetId: raw.assetId,
    ...(typeof raw.revisionIdBefore === "string"
      ? { revisionIdBefore: raw.revisionIdBefore }
      : {}),
    date: raw.date,
    action,
    outcome: raw.outcome as InterventionOutcome,
    actor: typeof raw.actor === "string" ? raw.actor : "unknown",
    ...(typeof raw.note === "string" ? { note: raw.note } : {}),
    effectiveScoreBefore:
      typeof raw.effectiveScoreBefore === "number" ? raw.effectiveScoreBefore : null,
    invocationsBefore:
      typeof raw.invocationsBefore === "number" ? raw.invocationsBefore : 0,
    dedupeKey,
    ...(typeof raw.supersedesId === "string" ? { supersedesId: raw.supersedesId } : {}),
    recordedAt:
      typeof raw.recordedAt === "string"
        ? raw.recordedAt
        : `${raw.date}T00:00:00.000Z`,
  };
}

export interface InterventionFile {
  version: 1;
  rows: unknown[];
}

/**
 * Parse an interventions file, tolerating an absent or malformed one, and upgrading each
 * row to the current shape (so the owner's existing v1 sidecar reads correctly). The
 * default tenant is the seed tenant; a sidecar row rarely carries one.
 */
export function parseInterventions(
  text: string | null | undefined,
  defaultTenantId = "tenant-fabricagent",
): InterventionRow[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<InterventionFile>;
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows
      .map((row) => upgradeInterventionRow(row as Record<string, unknown>, defaultTenantId))
      .filter((row): row is InterventionRow => row !== null);
  } catch {
    return [];
  }
}

export function serializeInterventions(rows: InterventionRow[]): string {
  const file = { version: 1 as const, rows };
  return `${JSON.stringify(file, null, 2)}\n`;
}
