import {
  authenticated,
  date,
  decimal,
  entity,
  one,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

import { Origin } from "./Origin.js";
import { Owner } from "./Owner.js";

@entity()
@authenticated("*")
export class Asset {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @set(
    "skill",
    "subagent",
    "prompt",
    "mcp-server",
    "hook",
    "command",
    "workflow",
  )
  type!:
    | "skill"
    | "subagent"
    | "prompt"
    | "mcp-server"
    | "hook"
    | "command"
    | "workflow";
  @text({ max: 200 }) name!: string;
  @text({ max: 200 }) slug!: string;
  @text({ max: 1000 }) description!: string;
  @text({ max: 4000, optional: true }) system?: string;
  @text({ max: 4000 }) body!: string;
  @text({ max: 40 }) version!: string;
  @set("active", "deprecated", "retired", "plugin-managed", "project-specific")
  status!:
    | "active"
    | "deprecated"
    | "retired"
    | "plugin-managed"
    | "project-specific";
  @set("low", "medium", "high") riskLevel!: "low" | "medium" | "high";
  @decimal({ precision: 5, scale: 4 }) maturity!: number;
  @set("stock", "custom", "forked") tier!: "stock" | "custom" | "forked";
  @text({ max: 40, optional: true }) stockVersion?: string;
  @text({ max: 64 }) contentHash!: string;
  @uuid({ optional: true }) ownerId?: string;
  @uuid({ optional: true }) originId?: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;

  // Relationship navigation for the Fabric data model and GraphQL. Additive: the
  // scalar @uuid() FKs above (ownerId, originId) stay the source of truth the app
  // reads; these declare the relationship graph. Lazy () => Target form.
  // optional:true makes the generated owner_id/origin_id columns NULLABLE, matching
  // the optional scalars and the coherence contract (which allows a missing owner/
  // origin). Without it the DAB generator emits NOT NULL FK columns, which rejects
  // any asset created without an owner/origin (e.g. an accepted contribution).
  @one(() => Owner, { optional: true }) owner?: Owner;
  @one(() => Origin, { optional: true }) origin?: Origin;
}
