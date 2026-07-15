import {
  authenticated,
  date,
  decimal,
  entity,
  int,
  one,
  text,
  uuid,
} from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";

@entity()
@authenticated("*")
export class Utilization {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() assetId!: string;
  @date() date!: Date;
  @int() invocations!: number;
  @int() successes!: number;
  @int() errors!: number;
  @int() refusals!: number;
  @int() latencyMs!: number;
  @int() tokens!: number;
  @decimal({ precision: 12, scale: 6 }) cost!: number;
  @text({ max: 64, optional: true }) model?: string;

  // Relationship navigation for the Fabric data model. The scalar @uuid() assetId
  // above stays the source of truth the app reads.
  @one(() => Asset) asset?: Asset;
}
