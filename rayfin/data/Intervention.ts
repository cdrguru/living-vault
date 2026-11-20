import {
  authenticated,
  date,
  decimal,
  entity,
  int,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

/**
 * The durable record of what an agent DID about a recommendation: the half of the loop
 * that makes the Vault a feedback system rather than a dashboard. Metadata only (an
 * action, an outcome, a date, an actor, a short note, and the frozen before-measurements
 * used to answer "did the change help?"); it never carries the diff or the reasoning.
 *
 * Append-only: rows are minted (never updated), and a same-day change of mind appends a
 * new row linked by `supersedesId` rather than overwriting the old one. See
 * src/data/interventions.ts and docs/superpowers/plans/2026-07-17-frontier-ecosystem-5-of-5-plan.md, WP2.
 *
 * assetId is a bare uuid scalar with no relationship navigation, deliberately. An
 * intervention is an audit-log fact that must survive the asset's deletion (a
 * `retired`/`merged` record is the tombstone that is MOST useful once the asset is gone),
 * so there is no FK, no cascade, and the coherence contract does not flag a dangling
 * intervention asset. Like the submission island's FK scalars, it is selected as authored
 * camelCase (`assetId`, not `asset_id`). The same reasoning applies to `revisionIdBefore`
 * and `supersedesId`: cross-store revision/row ids are not portable, so these stay bare
 * references rather than enforced foreign keys.
 */
@entity()
@authenticated("*")
export class Intervention {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() assetId!: string;
  @uuid({ optional: true }) revisionIdBefore?: string;
  @date() date!: Date;
  @set("retire", "improve", "merge", "promote", "review")
  action!: "retire" | "improve" | "merge" | "promote" | "review";
  @set("revised", "retired", "merged", "promoted", "deferred")
  outcome!: "revised" | "retired" | "merged" | "promoted" | "deferred";
  @text({ max: 64 }) actor!: string;
  @text({ max: 500, optional: true }) note?: string;
  @decimal({ precision: 5, scale: 4, optional: true }) effectiveScoreBefore?: number;
  @int() invocationsBefore!: number;
  @text({ max: 128 }) dedupeKey!: string;
  @uuid({ optional: true }) supersedesId?: string;
  @date() recordedAt!: Date;
}
