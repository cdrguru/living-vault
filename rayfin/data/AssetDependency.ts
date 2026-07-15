import { authenticated, entity, one, uuid } from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";

@entity()
@authenticated("*")
export class AssetDependency {
  @uuid() id!: string;
  @uuid() assetId!: string;
  @uuid() dependsOnAssetId!: string;

  // Self-referential dependency edge: two distinct @one() to Asset, one per FK.
  // The scalar @uuid() FKs above stay the source of truth the app reads.
  @one(() => Asset) asset?: Asset;
  @one(() => Asset) dependsOn?: Asset;
}
