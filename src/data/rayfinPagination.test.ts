import { describe, expect, it } from "vitest";

import {
  readAllRows,
  type PagedEntityQuery,
  type PagedQueryBuilder,
} from "./rayfinPagination";

/**
 * Fake paged entity over a fixed row set, mimicking the DAB connection contract:
 * first(n) bounds the page, after(cursor) resumes past the cursor row index, and
 * executePaginated reports hasNextPage/endCursor. Records the calls it saw so
 * tests can assert the cursor walk.
 */
function fakeEntity(
  rows: number[],
  overrides: Partial<{
    hasNextPageAlways: boolean;
    dropEndCursor: boolean;
  }> = {},
): { entity: PagedEntityQuery; calls: { first: number; after?: string }[] } {
  const calls: { first: number; after?: string }[] = [];
  const entity: PagedEntityQuery = {
    select: () => {
      const state: { first: number; after?: string } = { first: rows.length };
      const builder: PagedQueryBuilder = {
        first(count) {
          state.first = count;
          return builder;
        },
        after(cursor) {
          state.after = cursor;
          return builder;
        },
        async executePaginated() {
          calls.push({ ...state });
          const start = state.after === undefined ? 0 : Number(state.after);
          const items = rows.slice(start, start + state.first);
          const end = start + items.length;
          const hasNextPage = overrides.hasNextPageAlways ?? end < rows.length;
          return {
            items,
            hasNextPage,
            endCursor:
              overrides.dropEndCursor || items.length === 0
                ? undefined
                : String(end),
          };
        },
      };
      return builder;
    },
  };
  return { entity, calls };
}

describe("readAllRows", () => {
  it("returns a single short page without a second request", async () => {
    const { entity, calls } = fakeEntity([1, 2, 3]);
    const rows = await readAllRows(entity, ["id"], 100);
    expect(rows).toEqual([1, 2, 3]);
    expect(calls).toEqual([{ first: 100 }]);
  });

  it("walks the cursor across pages and concatenates every row", async () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const { entity, calls } = fakeEntity(all);
    const rows = await readAllRows(entity, ["id"], 10);
    expect(rows).toEqual(all);
    expect(calls).toEqual([
      { first: 10 },
      { first: 10, after: "10" },
      { first: 10, after: "20" },
    ]);
  });

  it("stops when the backend claims more pages but returns no cursor", async () => {
    const { entity } = fakeEntity([1, 2], {
      hasNextPageAlways: true,
      dropEndCursor: true,
    });
    const rows = await readAllRows(entity, ["id"], 2);
    expect(rows).toEqual([1, 2]);
  });

  it("throws instead of looping forever on a stuck cursor", async () => {
    const entity: PagedEntityQuery = {
      select: () => {
        const builder: PagedQueryBuilder = {
          first: () => builder,
          after: () => builder,
          executePaginated: async () => ({
            items: [0],
            hasNextPage: true,
            endCursor: "same",
          }),
        };
        return builder;
      },
    };
    await expect(readAllRows(entity, ["id"], 1)).rejects.toThrow(
      /still reports more pages/,
    );
  });
});
