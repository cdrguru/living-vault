/**
 * The Rayfin entity tables, by name. Mirrors the keys the read adapter
 * (rayfinReader.ts) queries and the classes in rayfin/data/schema.ts. Submission
 * and SubmissionItem back the review queue and live outside the catalog graph.
 */
export type RayfinEntityName =
  | "Asset"
  | "Tag"
  | "Origin"
  | "Owner"
  | "Bundle"
  | "AssetTag"
  | "AssetDependency"
  | "BundleMembership"
  | "Utilization"
  | "EvalResult"
  | "Submission"
  | "SubmissionItem";

/**
 * The write side of the Rayfin data API, kept symmetrical with {@link RayfinReader}:
 * a thin, fully mockable seam over `client.data.<Entity>.create/update/delete`.
 * Typed loosely on purpose (the generated per-entity input generics are validated
 * against a live Fabric backend at deploy, not here), so RayfinDataSource owns the
 * typed orchestration and the coherence contract runs before any call is issued.
 */
export interface RayfinWriter {
  /** Insert a row. The backend assigns the uuid id and returns it. */
  create(
    entity: RayfinEntityName,
    data: Record<string, unknown>,
  ): Promise<{ id: string }>;
  /** Update every row matching filter with the given column values. */
  update(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Promise<void>;
  /** Delete every row matching filter. */
  delete(
    entity: RayfinEntityName,
    filter: Record<string, unknown>,
  ): Promise<void>;
}

interface EntityMutations {
  create(data: Record<string, unknown>): Promise<{ id: string }>;
  update(
    filter: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Promise<void>;
  delete(filter: Record<string, unknown>): Promise<void>;
}

/**
 * Concrete writer over the live Rayfin client. The client is imported dynamically
 * so the seed and demo paths never pull it into their bundle, matching
 * createRayfinReader. Only exercised when createDataSource selects the Fabric
 * source; the exact mutation shapes are validated against Fabric at deploy.
 */
export function createRayfinWriter(): RayfinWriter {
  const mutations = async (
    entity: RayfinEntityName,
  ): Promise<EntityMutations> => {
    const { getRayfinClient } = await import("@/services/rayfinClient");
    const data = getRayfinClient().data as unknown as Record<
      string,
      EntityMutations
    >;
    return data[entity];
  };
  return {
    async create(entity, data) {
      return (await mutations(entity)).create(data);
    },
    async update(entity, filter, updates) {
      await (await mutations(entity)).update(filter, updates);
    },
    async delete(entity, filter) {
      await (await mutations(entity)).delete(filter);
    },
  };
}
