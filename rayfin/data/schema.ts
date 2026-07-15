import { Asset } from "./Asset.js";
import { AssetDependency } from "./AssetDependency.js";
import { AssetTag } from "./AssetTag.js";
import { Bundle } from "./Bundle.js";
import { BundleMembership } from "./BundleMembership.js";
import { EvalResult } from "./EvalResult.js";
import { Origin } from "./Origin.js";
import { Owner } from "./Owner.js";
import { Submission } from "./Submission.js";
import { SubmissionItem } from "./SubmissionItem.js";
import { Tag } from "./Tag.js";
import { Utilization } from "./Utilization.js";

export type AppSchema = {
  Asset: Asset;
  Tag: Tag;
  Origin: Origin;
  Owner: Owner;
  Bundle: Bundle;
  AssetTag: AssetTag;
  AssetDependency: AssetDependency;
  BundleMembership: BundleMembership;
  Utilization: Utilization;
  EvalResult: EvalResult;
  Submission: Submission;
  SubmissionItem: SubmissionItem;
};

export type BlankAppSchema = AppSchema;

export const schema = [
  Asset,
  Tag,
  Origin,
  Owner,
  Bundle,
  AssetTag,
  AssetDependency,
  BundleMembership,
  Utilization,
  EvalResult,
  Submission,
  SubmissionItem,
];
