import { authenticated, entity, text, uuid } from "@microsoft/rayfin-core";

@entity()
@authenticated("*")
export class Bundle {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @text({ max: 200 }) name!: string;
  @text({ max: 1000 }) description!: string;
}
