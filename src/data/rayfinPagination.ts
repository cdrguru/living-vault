/**
 * Cursor pagination over the Rayfin typed data API. DAB serves reads in pages
 * (default page size 100) and `select(...).execute()` returns only the first
 * page, so any table past 100 rows silently truncates: reconciles miss assets,
 * join syncs diff against partial state, and delete-then-recreate leaves stale
 * rows behind. Every full-table read (rayfinReader.ts and the headless
 * scripts/fabric-import-*.mts) goes through {@link readAllRows} instead, which
 * walks `first(pageSize)` / `after(endCursor)` until the backend reports no
 * next page. Typed loosely on purpose, like rayfinReader's EntityQuery: the
 * generated per-entity generics are validated against a live backend at deploy.
 */

export interface PagedQueryBuilder {
  first: (count: number) => PagedQueryBuilder;
  after: (cursor: string) => PagedQueryBuilder;
  executePaginated: () => Promise<{
    items: unknown[];
    hasNextPage: boolean;
    endCursor?: string;
  }>;
}

export interface PagedEntityQuery {
  select: (fields: string[]) => PagedQueryBuilder;
}

/** DAB's default page size; explicit so the loop never depends on server config. */
export const PAGE_SIZE = 100;

/**
 * Backstop against a misbehaving backend that reports hasNextPage forever:
 * 1000 pages x 100 rows is far past any real table in this app.
 */
const MAX_PAGES = 1000;

/** Read every row of one entity, walking the DAB connection cursor to the end. */
export async function readAllRows(
  entity: PagedEntityQuery,
  fields: string[],
  pageSize: number = PAGE_SIZE,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let builder = entity.select(fields).first(pageSize);
    if (cursor !== undefined) builder = builder.after(cursor);
    const result = await builder.executePaginated();
    rows.push(...result.items);
    if (
      !result.hasNextPage ||
      result.items.length === 0 ||
      result.endCursor === undefined
    ) {
      return rows;
    }
    cursor = result.endCursor;
  }
  throw new Error(
    `readAllRows: backend still reports more pages after ${MAX_PAGES}; aborting instead of looping.`,
  );
}
