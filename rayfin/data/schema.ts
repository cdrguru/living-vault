import { Asset } from "./Asset.js";
import { AssetDependency } from "./AssetDependency.js";
import { AssetRevision } from "./AssetRevision.js";
import { AssetTag } from "./AssetTag.js";
import { Baseline } from "./Baseline.js";
import { Bundle } from "./Bundle.js";
import { BundleMembership } from "./BundleMembership.js";
import { EvalResult } from "./EvalResult.js";
import { Intervention } from "./Intervention.js";
import { Origin } from "./Origin.js";
import { Owner } from "./Owner.js";
import { RoutingStat } from "./RoutingStat.js";
import { Submission } from "./Submission.js";
import { SubmissionItem } from "./SubmissionItem.js";
import { Tag } from "./Tag.js";
import { Utilization } from "./Utilization.js";

export type AppSchema = {
  Asset: Asset;
  AssetRevision: AssetRevision;
  Tag: Tag;
  Origin: Origin;
  Owner: Owner;
  Bundle: Bundle;
  AssetTag: AssetTag;
  AssetDependency: AssetDependency;
  BundleMembership: BundleMembership;
  Utilization: Utilization;
  EvalResult: EvalResult;
  RoutingStat: RoutingStat;
  Baseline: Baseline;
  Intervention: Intervention;
  Submission: Submission;
  SubmissionItem: SubmissionItem;
};

export type BlankAppSchema = AppSchema;

export const schema = [
  Asset,
  AssetRevision,
  Tag,
  Origin,
  Owner,
  Bundle,
  AssetTag,
  AssetDependency,
  BundleMembership,
  Utilization,
  EvalResult,
  RoutingStat,
  Baseline,
  Intervention,
  Submission,
  SubmissionItem,
];
