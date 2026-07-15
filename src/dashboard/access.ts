import type { OwnerRole, OwnerRow } from "@/data";

// Role-based access for the submission review queue. Pure and React-free so nav
// and tests can import it without pulling in the auth/vault contexts; the React
// hook that resolves the live actor lives in useActor.ts. v1 gates UI only;
// enforced RBAC is Fabric-deploy work.
const RANK: Record<OwnerRole, number> = {
  viewer: 0,
  author: 1,
  maintainer: 2,
  admin: 3,
};

/** True when `role` ranks at or above `min`. */
export function atLeast(role: OwnerRole, min: OwnerRole): boolean {
  return RANK[role] >= RANK[min];
}

/** Maintainers and admins may review and decide submissions. */
export function canReview(role: OwnerRole): boolean {
  return atLeast(role, "maintainer");
}

function ownerByEmail(
  owners: OwnerRow[],
  email: string | undefined,
): OwnerRow | undefined {
  if (!email) return undefined;
  const needle = email.toLowerCase();
  return owners.find((owner) => owner.email.toLowerCase() === needle);
}

/**
 * Resolve the signed-in user's role from the catalog's Owner rows by email. When
 * the email matches no owner, fall back to admin in a dev/demo context (so the
 * queue is reachable in the local loop and the SWA demo) and viewer otherwise.
 */
export function resolveActorRole(
  owners: OwnerRow[],
  email: string | undefined,
  opts: { dev?: boolean } = {},
): OwnerRole {
  const match = ownerByEmail(owners, email);
  if (match) return match.role;
  return opts.dev ? "admin" : "viewer";
}

/** The owner id for the signed-in user, or undefined when they are not an owner. */
export function actorOwnerId(
  owners: OwnerRow[],
  email: string | undefined,
): string | undefined {
  return ownerByEmail(owners, email)?.id;
}

/**
 * SHA-256 digests of the deploy owner's Microsoft Fabric admin emails. The plaintext
 * is deliberately NOT in source, so the owner's real emails never ship in the SWA or
 * Fabric App bundle; the guard hashes the signed-in email and compares. These global
 * Fabric admins resolve to admin regardless of the Owner table, so the maintainer/
 * admin gate can never lock the deploy owner out of their own app, and we never have
 * to seed their email into the readable catalog data.
 */
const BOOTSTRAP_ADMIN_HASHES = new Set<string>([
  "d63794ae0853f9196061236fd759691dcf35e30e38575eda8b832430eb42262e",
  "508c63ab0f7dbc4fabe10cf647eabc4550b651d3c17551b5a8fe6ac666783888",
]);

/** Lowercase hex SHA-256 of a UTF-8 string, via the platform SubtleCrypto digest. */
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Whether an email is a bootstrap admin, by matching its SHA-256 against the baked
 * digest allowlist (default) or an injected one (tests). Async because SubtleCrypto's
 * digest is async; both the review guard and useActor consult it. Normalizes the email
 * (trim + lowercase) so case and surrounding space do not affect the match.
 */
export async function isBootstrapAdmin(
  email: string | undefined,
  hashes: Set<string> = BOOTSTRAP_ADMIN_HASHES,
): Promise<boolean> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return hashes.has(await sha256Hex(normalized));
}

/**
 * Build an async review guard for the live Fabric source (RBAC option C). It pulls
 * the signed-in user's email and the catalog owners from the injected resolver, and
 * returns whether they may review: a bootstrap admin always may; otherwise the email
 * maps to an Owner role and must be maintainer or admin. There is no dev fallback
 * here: in production an unrecognized user is a viewer, denied. The resolver is
 * injected so this stays pure and testable; createDataSource wires it to the Fabric
 * auth session and the reader's owners.
 */
export function makeReviewGuard(
  getActor: () => Promise<{ email?: string; owners: OwnerRow[] } | null>,
): () => Promise<boolean> {
  return async () => {
    const actor = await getActor();
    if (!actor?.email) return false;
    if (await isBootstrapAdmin(actor.email)) return true;
    return canReview(resolveActorRole(actor.owners, actor.email));
  };
}
