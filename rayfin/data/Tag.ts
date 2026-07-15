import { authenticated, entity, set, text, uuid } from "@microsoft/rayfin-core";

@entity()
@authenticated("*")
export class Tag {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @set("domain", "capability", "pillar") kind!:
    | "domain"
    | "capability"
    | "pillar";
  @text({ max: 100 }) name!: string;
}
