import { authenticated, entity, one, uuid } from "@microsoft/rayfin-core";

import { Asset } from "./Asset.js";
import { Bundle } from "./Bundle.js";

@entity()
@authenticated("*")
export class BundleMembership {
  @uuid() id!: string;
  @uuid() bundleId!: string;
  @uuid() assetId!: string;

  // Relationship navigation for the Fabric data model. The scalar @uuid() FKs
  // above stay the source of truth; these declare the join edges.
  @one(() => Bundle) bundle?: Bundle;
  @one(() => Asset) asset?: Asset;
}
