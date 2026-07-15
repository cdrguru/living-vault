import { authenticated, entity, set, text, uuid } from "@microsoft/rayfin-core";

@entity()
@authenticated("*")
export class Origin {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @text({ max: 200 }) name!: string;
  @set("repo", "url", "local", "plugin", "giac") kind!:
    | "repo"
    | "url"
    | "local"
    | "plugin"
    | "giac";
  @text({ max: 500, optional: true }) url?: string;
}
