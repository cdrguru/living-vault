import {
  authenticated,
  decimal,
  entity,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

/**
 * One staged asset within a Submission. Columns mirror the Asset bounds so the
 * accept path can rebuild a contract-clean asset. The reconcile key the accept
 * path uses is (assetType, assetSlug); the eventual Asset id is minted at accept,
 * so no staged asset id is persisted here. Tag associations are NOT staged in this
 * first deploy (tag definitions are not carried); they remain a follow-up.
 */
@entity()
@authenticated("*")
export class SubmissionItem {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() submissionId!: string;
  @text({ max: 200 }) assetName!: string;
  @set(
    "skill",
    "subagent",
    "prompt",
    "mcp-server",
    "hook",
    "command",
    "workflow",
  )
  assetType!:
    | "skill"
    | "subagent"
    | "prompt"
    | "mcp-server"
    | "hook"
    | "command"
    | "workflow";
  @text({ max: 200 }) assetSlug!: string;
  @text({ max: 1000 }) description!: string;
  @text({ max: 4000, optional: true }) system?: string;
  @text({ max: 4000 }) body!: string;
  @text({ max: 40 }) version!: string;
  @set("active", "deprecated", "retired", "plugin-managed", "project-specific")
  assetStatus!:
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
  @set("new", "duplicate", "conflict") dedupVerdict!:
    | "new"
    | "duplicate"
    | "conflict";
  @uuid({ optional: true }) duplicateAssetId?: string;
  @set("pending", "accept", "refine", "reject") decision!:
    | "pending"
    | "accept"
    | "refine"
    | "reject";
  @text({ max: 1000, optional: true }) reviewerNote?: string;
}
