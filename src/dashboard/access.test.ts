import { describe, expect, it } from "vitest";

import type { OwnerRow } from "@/data";
import {
  actorOwnerId,
  atLeast,
  canReview,
  isBootstrapAdmin,
  makeReviewGuard,
  resolveActorRole,
} from "./access";

const owners: OwnerRow[] = [
  {
    id: "own-admin",
    tenantId: "t",
    name: "Admin",
    email: "admin@x.com",
    role: "admin",
  },
  {
    id: "own-maint",
    tenantId: "t",
    name: "Maint",
    email: "Maint@X.com",
    role: "maintainer",
  },
  {
    id: "own-author",
    tenantId: "t",
    name: "Auth",
    email: "auth@x.com",
    role: "author",
  },
];

describe("makeReviewGuard", () => {
  it("allows a maintainer or admin resolved from the actor's email", async () => {
    const guard = makeReviewGuard(async () => ({
      email: "maint@x.com",
      owners,
    }));
    expect(await guard()).toBe(true);
  });

  it("denies an author and an unknown email (no dev fallback)", async () => {
    expect(
      await makeReviewGuard(async () => ({ email: "auth@x.com", owners }))(),
    ).toBe(false);
    expect(
      await makeReviewGuard(async () => ({
        email: "stranger@x.com",
        owners,
      }))(),
    ).toBe(false);
  });

  it("denies when there is no actor or no email", async () => {
    expect(await makeReviewGuard(async () => null)()).toBe(false);
    expect(
      await makeReviewGuard(async () => ({ email: undefined, owners }))(),
    ).toBe(false);
  });
});

describe("resolveActorRole", () => {
  it("returns the matched owner's role, matching email case-insensitively", () => {
    expect(resolveActorRole(owners, "maint@x.com")).toBe("maintainer");
    expect(resolveActorRole(owners, "ADMIN@x.com")).toBe("admin");
  });

  it("falls back to admin in a dev/demo context when the email is unknown", () => {
    expect(resolveActorRole(owners, "stranger@x.com", { dev: true })).toBe(
      "admin",
    );
    expect(resolveActorRole(owners, undefined, { dev: true })).toBe("admin");
  });

  it("falls back to viewer outside dev/demo when the email is unknown", () => {
    expect(resolveActorRole(owners, "stranger@x.com")).toBe("viewer");
    expect(resolveActorRole(owners, undefined)).toBe("viewer");
  });

  it("prefers a real owner match over the dev fallback", () => {
    expect(resolveActorRole(owners, "auth@x.com", { dev: true })).toBe(
      "author",
    );
  });
});

describe("atLeast", () => {
  it("ranks roles viewer < author < maintainer < admin", () => {
    expect(atLeast("admin", "maintainer")).toBe(true);
    expect(atLeast("maintainer", "maintainer")).toBe(true);
    expect(atLeast("author", "maintainer")).toBe(false);
    expect(atLeast("viewer", "author")).toBe(false);
  });
});

describe("canReview", () => {
  it("is true only for maintainer and admin", () => {
    expect(canReview("admin")).toBe(true);
    expect(canReview("maintainer")).toBe(true);
    expect(canReview("author")).toBe(false);
    expect(canReview("viewer")).toBe(false);
  });
});

describe("actorOwnerId", () => {
  it("returns the matched owner id or undefined", () => {
    expect(actorOwnerId(owners, "auth@x.com")).toBe("own-author");
    expect(actorOwnerId(owners, "nobody@x.com")).toBeUndefined();
    expect(actorOwnerId(owners, undefined)).toBeUndefined();
  });
});

describe("isBootstrapAdmin", () => {
  // SHA-256 of "vip@example.com", a control vector, not a real admin email. Lets us
  // exercise the hash match without putting any real email in the test or the bundle.
  const VIP_HASH =
    "10931af529327c4862e1655a58c9b0103f9b7efb874cb84a78037feb0d5e1c4c";

  it("matches an allowlisted email by SHA-256, case- and space-insensitively", async () => {
    const hashes = new Set([VIP_HASH]);
    expect(await isBootstrapAdmin("vip@example.com", hashes)).toBe(true);
    expect(await isBootstrapAdmin("  VIP@Example.com ", hashes)).toBe(true);
  });

  it("does not match a non-listed, empty, or missing email", async () => {
    const hashes = new Set([VIP_HASH]);
    expect(await isBootstrapAdmin("nobody@example.com", hashes)).toBe(false);
    expect(await isBootstrapAdmin("", hashes)).toBe(false);
    expect(await isBootstrapAdmin(undefined, hashes)).toBe(false);
  });

  it("does not match against the default allowlist for a random email", async () => {
    expect(await isBootstrapAdmin("nobody@example.com")).toBe(false);
  });
});
