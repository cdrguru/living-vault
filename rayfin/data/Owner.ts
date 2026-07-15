import {
  authenticated,
  email,
  entity,
  set,
  text,
  uuid,
} from "@microsoft/rayfin-core";

@entity()
@authenticated("*")
export class Owner {
  @uuid() id!: string;
  @uuid() tenantId!: string;
  @text({ max: 200 }) name!: string;
  @email() email!: string;
  @set("viewer", "author", "maintainer", "admin") role!:
    | "viewer"
    | "author"
    | "maintainer"
    | "admin";
}
