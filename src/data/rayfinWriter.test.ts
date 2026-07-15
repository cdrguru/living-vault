import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetCreate: vi.fn(),
  assetUpdate: vi.fn(),
  assetRemove: vi.fn(),
  tagCreate: vi.fn(),
}));

vi.mock("@/services/rayfinClient", () => ({
  getRayfinClient: () => ({
    data: {
      Asset: {
        create: mocks.assetCreate,
        update: mocks.assetUpdate,
        delete: mocks.assetRemove,
      },
      Tag: {
        create: mocks.tagCreate,
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  }),
}));

import { createRayfinWriter } from "./rayfinWriter";

describe("createRayfinWriter", () => {
  it("delegates create, update, and delete to the named entity on the client data API", async () => {
    mocks.assetCreate.mockResolvedValue({ id: "new-id" });
    mocks.assetUpdate.mockResolvedValue(undefined);
    mocks.assetRemove.mockResolvedValue(undefined);
    mocks.tagCreate.mockResolvedValue({ id: "tag-id" });
    const writer = createRayfinWriter();

    const created = await writer.create("Asset", { name: "x" });
    expect(created).toEqual({ id: "new-id" });
    expect(mocks.assetCreate).toHaveBeenCalledWith({ name: "x" });

    await writer.update("Asset", { id: "a" }, { name: "y" });
    expect(mocks.assetUpdate).toHaveBeenCalledWith({ id: "a" }, { name: "y" });

    await writer.delete("Asset", { id: "a" });
    expect(mocks.assetRemove).toHaveBeenCalledWith({ id: "a" });

    // Routes by entity name: a Tag create hits Tag.create, not Asset.create.
    await writer.create("Tag", { name: "domain" });
    expect(mocks.tagCreate).toHaveBeenCalledWith({ name: "domain" });
    expect(mocks.assetCreate).toHaveBeenCalledTimes(1);
  });
});
