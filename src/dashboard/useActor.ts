import { useEffect, useState } from "react";

import type { OwnerRole } from "@/data";
import { useAuth } from "@/hooks/AuthContext";
import {
  actorOwnerId,
  isBootstrapAdmin,
  resolveActorRole,
} from "@/dashboard/access";
import { useVault } from "@/dashboard/VaultContext";

/** Dev or demo build: the role fallback opens the queue when the user is not yet an owner. */
function isDevLike(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
}

export interface Actor {
  role: OwnerRole;
  /** Owner id for attribution; falls back to the auth user id, then "anonymous". */
  ownerId: string;
}

/** Resolve the signed-in actor's role and attribution id from the catalog owners. */
export function useActor(): Actor {
  const { user } = useAuth();
  const { dataset } = useVault();
  const owners = dataset?.owners ?? [];
  const baseRole = resolveActorRole(owners, user?.email, { dev: isDevLike() });

  // A bootstrap admin (the deploy owner's Fabric admin email, matched by hash) is
  // admin regardless of the Owner table. The check is async (SubtleCrypto), so it
  // upgrades the role after resolution; createDataSource enforces the same allowlist
  // server-side, this only keeps the UI affordance consistent.
  const [isBootstrap, setIsBootstrap] = useState(false);
  useEffect(() => {
    let active = true;
    void isBootstrapAdmin(user?.email).then((value) => {
      if (active) setIsBootstrap(value);
    });
    return () => {
      active = false;
    };
  }, [user?.email]);

  return {
    role: isBootstrap ? "admin" : baseRole,
    ownerId: actorOwnerId(owners, user?.email) ?? user?.id ?? "anonymous",
  };
}
