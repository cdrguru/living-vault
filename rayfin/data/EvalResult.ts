import {
  authenticated,
  date,
  decimal,
  entity,
  int,
  one,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";

/**
 * A measured private-eval outcome for an asset: a Utilization-shaped, metadata-only fact
 * table (numeric outcomes, timings, cost, and an honesty grade). It carries NO authored
 * free-text column: the eval case's prompt/rubric/response lives only in a gitignored,
 * DEV-only eval-cases.local.json, joined by caseHash, so real eval content never becomes a
 * Fabric column. See docs/superpowers/specs/2026-07-07-private-eval-artifact-design.md.
 */
@entity()
@authenticated("*")
export class EvalResult {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() assetId!: string;
  @text({ max: 64 }) caseHash!: string;
  @date() date!: Date;
  @int() trials!: number;
  @int() passed!: number;
  @int() failed!: number;
  @int() errored!: number;
  /** The fourth outcome bucket: the run completed but the verdict was unusable.
   *  Recorded, never dropped; a dropped inconclusive silently biases the retained
   *  sample toward clean verdicts. Counted inside trials. */
  @int() inconclusive!: number;
  @int() latencyMs!: number;
  @int() tokens!: number;
  @decimal({ precision: 12, scale: 6 }) cost!: number;
  @text({ max: 64, optional: true }) model?: string;
  @set("full", "partial", "occupancy", "derived", "modeled", "none")
  quality!: "full" | "partial" | "occupancy" | "derived" | "modeled" | "none";

  // Eval identity (WP4 / PR12): which asset VERSION the result ran against, which
  // harness ran it, and what it was compared to. All three are DURABLE BARE
  // references (no @one, no SQL REFERENCES), following the Intervention precedent:
  // an eval row referencing an unknown or pruned revision/baseline must survive as
  // a fact with capped honesty, never fail an insert or be dropped (dropping is
  // what biases the sample). A row with a null assetRevisionId is capped at
  // "derived" honesty on read regardless of its declared quality: self-declared
  // "full" on an unversioned result is self-certification.
  @uuid({ optional: true }) assetRevisionId?: string;
  @text({ max: 32, optional: true }) harness?: string;
  @uuid({ optional: true }) baselineId?: string;

  // Relationship navigation for the Fabric data model. The scalar @uuid() assetId above
  // stays the source of truth the app reads.
  @one(() => Asset) asset?: Asset;
}
