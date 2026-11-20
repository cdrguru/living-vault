import {
  authenticated,
  date,
  entity,
  int,
  one,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";

/**
 * An immutable snapshot of one version of an asset's content: the anchor every
 * before/after claim hangs on. Asset.body is the CURRENT text and updateAsset
 * overwrites it in place, so without this table the product cannot say which version
 * of an asset produced a result, and "did the change help?" has no referent.
 *
 * Append-only: rows are minted (by ensureRevisions in src/data/revisions.ts, or by the
 * 0005 migration backfill) and never updated or individually deleted; they go away only
 * when their asset does. seq is a monotonic per-asset counter, 1-based. contentHash is
 * copied from the asset at mint time; a revert mints a NEW revision whose body equals an
 * older one, it never rewrites history.
 *
 * There is deliberately NO Asset.currentRevisionId back-reference. The current revision
 * is derived (the highest seq), and a mutual Asset <-> AssetRevision FK would make
 * replaceDataset's insert order circular. See the 2026-07-17 plan, WP1.
 */
@entity()
@authenticated("*")
export class AssetRevision {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @uuid() assetId!: string;
  @int() seq!: number;
  @text({ max: 4000 }) body!: string;
  @text({ max: 64 }) contentHash!: string;
  @date() createdAt!: Date;
  @text({ max: 64 }) createdByActor!: string;
  @set("vault-write", "observed-scan", "import")
  source!: "vault-write" | "observed-scan" | "import";

  // Relationship navigation for the Fabric data model. The scalar @uuid() assetId above
  // stays the source of truth the app reads.
  @one(() => Asset) asset?: Asset;
}
