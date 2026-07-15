import {
  authenticated,
  date,
  entity,
  int,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

/**
 * A staged contribution awaiting review. Deliberately NOT related to the catalog
 * entities: a pending submission lives outside the asset graph (and outside the
 * VaultDataset the UI reads) so metrics and the coherence contract never see it
 * until an item is accepted. FK columns are plain @uuid scalars (no @one
 * navigation), so the read adapter selects them as authored camelCase and the
 * maintainer review gate is enforced in the app, not via DAB roles (DAB supports
 * only anonymous/authenticated, which cannot model "maintainer sees all").
 */
@entity()
@authenticated("*")
export class Submission {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() submittedByOwnerId!: string;
  @uuid({ optional: true }) originId?: string;
  @set("submitted", "under_review", "changes_requested", "accepted", "rejected")
  status!:
    | "submitted"
    | "under_review"
    | "changes_requested"
    | "accepted"
    | "rejected";
  @int() itemCount!: number;
  @int() acceptedCount!: number;
  @int() rejectedCount!: number;
  @int() conflictCount!: number;
  @text({ max: 64 }) contentHash!: string;
  @date() submittedAt!: Date;
  @uuid({ optional: true }) reviewedByOwnerId?: string;
  @date({ optional: true }) reviewedAt?: Date;
  @text({ max: 1000, optional: true }) note?: string;
}
