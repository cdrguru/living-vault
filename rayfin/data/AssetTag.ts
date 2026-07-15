import { authenticated, entity, one, uuid } from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";
import { Tag } from "./Tag.js";

@entity()
@authenticated("*")
export class AssetTag {
  @uuid() id!: string;
  @uuid() assetId!: string;
  @uuid() tagId!: string;

  // Relationship navigation for the Fabric data model. The scalar @uuid() FKs
  // above stay the source of truth; these declare the join edges.
  @one(() => Asset) asset?: Asset;
  @one(() => Tag) tag?: Tag;
}
