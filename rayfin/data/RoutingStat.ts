import {
  authenticated,
  date,
  decimal,
  entity,
  int,
  one,
  uuid,
} from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";

// Daily per-asset routing decision aggregates from an external orchestrator
// or a local router: how often the asset resolved a request locally (a
// cache hit), how often the router fell back to an external model, and the
// money on both sides. Fact table like Utilization: a real asset FK, replaced
// wholesale by importRoutingStats. avoidedCostEstimate is a modeled
// counterfactual; the honesty grading lives in the app-side RoutingStatsMeta
// (no Fabric mirror, TelemetryMeta precedent).
@entity()
@authenticated("*")
export class RoutingStat {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() assetId!: string;
  @date() date!: Date;
  @int() localHits!: number;
  @int() externalFallbacks!: number;
  @int() belowThreshold!: number;
  @decimal({ precision: 12, scale: 6 }) externalCost!: number;
  @decimal({ precision: 12, scale: 6 }) avoidedCostEstimate!: number;

  // Relationship navigation for the Fabric data model. The scalar @uuid() assetId
  // above stays the source of truth the app reads.
  @one(() => Asset) asset?: Asset;
}
