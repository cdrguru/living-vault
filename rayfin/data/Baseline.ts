import { authenticated, date, entity, set, text, uuid } from "@microsoft/rayfin-core";

/**
 * The thing an eval result is compared against, so `counterfactual` can
 * eventually be non-null HONESTLY. The counterfactual math in metrics.ts is
 * implemented and its sole production caller (scoreAssetDetailed) hardcodes
 * null; that stays until a `no-asset-control` baseline exists with real
 * trials (plan risk R2: wiring it earlier would move the point estimate at
 * weight 0.7 on fabricated evidence). This entity's existence does NOT
 * license turning it on; counterfactualNull.test.ts pins the null.
 *
 * assetRevisionId is a durable bare reference (no @one, no SQL REFERENCES),
 * like EvalResult's identity fields: a baseline that outlives its revision
 * stays a valid record of what was compared. Immutable after insert.
 */
@entity()
@authenticated("*")
export class Baseline {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @set("no-asset-control", "prior-revision", "alternate-asset")
  kind!: "no-asset-control" | "prior-revision" | "alternate-asset";
  @uuid({ optional: true }) assetRevisionId?: string;
  @text({ max: 128 }) label!: string;
  @date() createdAt!: Date;
}
