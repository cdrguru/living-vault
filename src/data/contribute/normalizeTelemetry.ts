import type { AssetRow, AssetType, TelemetryMeta, UtilizationRow } from "../types";

/**
 * Validate and reconcile an uploaded telemetry snapshot so a contributor can push
 * their real usage into the deployed Fabric app without running a local collector
 * against it. Pure and dependency-free, mirroring contribute/normalize.ts (which
 * handles a projection; this handles telemetry).
 *
 * The hard part is identity. The collector keys each row by a cc-<type>-<slug>
 * overlay id, but the deployed catalog keys the same asset by a uuid5 id, so the
 * upload carries (sourceType, sourceSlug) per row and {@link reconcileTelemetryAssetIds}
 * rewrites each row's assetId onto the live catalog id by (type, slug) before the
 * row reaches importTelemetry. Rows whose (type, slug) is not in the deployed
 * catalog keep their original id and are dropped downstream by applyTelemetry's
 * assetId guard, so the existing DataSource seam and its guards are untouched.
 *
 * Metadata only: rows carry counts, latency, cost, model, and the catalog identity
 * (type, slug); never prompt or response content. See docs/PRIVACY.md.
 */

/** Thrown when an upload cannot be coerced into a usable telemetry snapshot. Message is user-facing. */
export class TelemetryUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryUploadError";
  }
}

/** Composite-key separator, matching merge.ts so the (type, slug) reconcile key is identical. */
const KEY_SEP = "::";

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000000";

/** Cap on rows per upload, so a crafted file cannot freeze the main thread. */
const TELEMETRY_MAX_ROWS = 20000;

const ASSET_TYPES: readonly AssetType[] = [
  "skill",
  "subagent",
  "prompt",
  "mcp-server",
  "hook",
  "command",
  "workflow",
];

/** A row as it travels in the upload envelope: a UtilizationRow plus the catalog identity to reconcile on. */
export type TelemetryUploadRow = UtilizationRow & {
  sourceType?: AssetType;
  sourceSlug?: string;
};

export interface TelemetryUpload {
  rows: TelemetryUploadRow[];
  meta: TelemetryMeta;
}

export interface ReconcileResult {
  /** Clean UtilizationRow[] ready for importTelemetry: matched rows rewritten to the catalog id, unmatched passed through (and dropped downstream). */
  rows: UtilizationRow[];
  /** Distinct "type::slug" keys that matched a deployed catalog asset. */
  matchedKeys: string[];
  /** Distinct "type::slug" keys with no asset in the deployed catalog (their rows will be dropped). */
  unmatchedKeys: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

/** Coerce to a finite, non-negative integer; fall back to 0. Counts are never negative or fractional. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

/** Coerce to a finite, non-negative number (cost can be fractional); fall back to 0. */
function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function assetType(value: unknown): AssetType | undefined {
  return typeof value === "string" &&
    (ASSET_TYPES as readonly string[]).includes(value)
    ? (value as AssetType)
    : undefined;
}

function normalizeRow(raw: unknown, index: number): TelemetryUploadRow {
  if (!isRecord(raw)) {
    throw new TelemetryUploadError(`rows[${index}] is not an object.`);
  }
  const assetId = str(raw, "assetId");
  if (!assetId) {
    throw new TelemetryUploadError(`rows[${index}]: missing required "assetId".`);
  }
  const date = str(raw, "date");
  if (!date) {
    throw new TelemetryUploadError(`rows[${index}]: missing required "date".`);
  }
  const invocations = count(raw.invocations);
  // Clamp the outcome counts so no upload can violate the coherence contract's
  // successes+errors+refusals <= invocations rule and make importTelemetry throw.
  const successes = Math.min(count(raw.successes), invocations);
  const errors = Math.min(count(raw.errors), invocations - successes);
  const refusals = Math.min(
    count(raw.refusals),
    invocations - successes - errors,
  );
  return {
    id: str(raw, "id") ?? `${assetId}:${date}:${str(raw, "model") ?? "unknown"}`,
    tenantId: str(raw, "tenantId") ?? PLACEHOLDER_TENANT,
    assetId,
    date,
    invocations,
    successes,
    errors,
    refusals,
    latencyMs: count(raw.latencyMs),
    tokens: count(raw.tokens),
    cost: amount(raw.cost),
    model: str(raw, "model"),
    sourceType: assetType(raw.sourceType),
    sourceSlug: str(raw, "sourceSlug"),
  };
}

const TRACKED_KEYS = [
  "invocations",
  "successes",
  "errors",
  "latency",
  "refusals",
  "tokens",
  "cost",
] as const;

/** Use the uploaded meta when it is a claude-code TelemetryMeta; otherwise fabricate a valid one from the rows. */
function coerceMeta(raw: unknown, rows: TelemetryUploadRow[]): TelemetryMeta {
  const dates = rows.map((r) => r.date).sort();
  const fallback: TelemetryMeta = {
    source: "claude-code",
    generatedAt: new Date().toISOString(),
    windowStart: dates[0] ?? "",
    windowEnd: dates[dates.length - 1] ?? "",
    sessions: 0,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: true,
      tokens: true,
      cost: true,
      model: rows.some((r) => r.model !== undefined),
    },
  };
  if (!isRecord(raw) || raw.source !== "claude-code") return fallback;
  const tracked = isRecord(raw.tracked) ? raw.tracked : {};
  return {
    source: "claude-code",
    generatedAt: str(raw, "generatedAt") ?? fallback.generatedAt,
    windowStart: str(raw, "windowStart") ?? fallback.windowStart,
    windowEnd: str(raw, "windowEnd") ?? fallback.windowEnd,
    sessions: count(raw.sessions),
    tracked: {
      ...fallback.tracked,
      ...Object.fromEntries(
        TRACKED_KEYS.map((k) => [k, tracked[k] !== false]),
      ),
      model: tracked.model === true || fallback.tracked.model,
    },
  };
}

/**
 * Coerce an uploaded value into a TelemetryUpload. Forgiving on shape (accepts the
 * {source, version, meta, rows} envelope, a bare {rows, meta}, or a bare row array),
 * strict on coherence (caps rows, clamps counts, rejects an empty upload).
 */
export function normalizeTelemetryUpload(raw: unknown): TelemetryUpload {
  const root: Record<string, unknown> = Array.isArray(raw)
    ? { rows: raw }
    : isRecord(raw)
      ? raw
      : (() => {
          throw new TelemetryUploadError(
            'Uploaded content must be a JSON object with a "rows" array, or a JSON array of telemetry rows.',
          );
        })();

  const rawRows = root.rows;
  if (rawRows !== undefined && !Array.isArray(rawRows)) {
    throw new TelemetryUploadError('"rows" must be an array.');
  }
  const rowsArray = Array.isArray(rawRows) ? rawRows : [];
  if (rowsArray.length === 0) {
    throw new TelemetryUploadError("No telemetry rows found in the upload.");
  }
  if (rowsArray.length > TELEMETRY_MAX_ROWS) {
    throw new TelemetryUploadError(
      `Too many rows (${rowsArray.length}); the maximum per upload is ${TELEMETRY_MAX_ROWS}.`,
    );
  }
  const rows = rowsArray.map(normalizeRow);
  return { rows, meta: coerceMeta(root.meta, rows) };
}

/** Parse uploaded file text as JSON, then normalize. Separates parse errors from shape errors. */
export function parseTelemetryUpload(text: string): TelemetryUpload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TelemetryUploadError("File is not valid JSON.");
  }
  return normalizeTelemetryUpload(parsed);
}

/**
 * Rewrite each uploaded row's assetId (and tenantId, and dedup id) onto the live
 * deployed catalog by (type, slug), so rows attributed to cc-<type>-<slug> overlay
 * ids match the catalog's uuid5 ids. Pure: inputs are not mutated. Rows whose
 * (sourceType, sourceSlug) has no catalog asset pass through with their original
 * assetId so applyTelemetry's assetId guard drops them. The (type, slug) join key
 * is the whole type string, never split on "-", so multi-word types (mcp-server)
 * reconcile with no special-casing. sourceType/sourceSlug are stripped from the
 * returned rows, which are clean UtilizationRow[].
 */
export function reconcileTelemetryAssetIds(
  rows: TelemetryUploadRow[],
  assets: AssetRow[],
): ReconcileResult {
  const keyToId = new Map<string, string>();
  for (const asset of assets) {
    const key = `${asset.type}${KEY_SEP}${asset.slug}`;
    const incumbent = keyToId.get(key);
    // The catalog id (uuid5) is the target; if two assets collide on (type, slug),
    // prefer a non-cc id so the reconcile points at the real catalog row.
    if (incumbent === undefined || incumbent.startsWith("cc-")) {
      keyToId.set(key, asset.id);
    }
  }

  const matchedKeys = new Set<string>();
  const unmatchedKeys = new Set<string>();
  const out: UtilizationRow[] = rows.map((row) => {
    const { sourceType, sourceSlug, ...clean } = row;
    if (sourceType === undefined || sourceSlug === undefined) {
      // No catalog identity to reconcile on: keep the row as-is. It only survives
      // if its assetId already equals a deployed catalog id (the degraded fallback).
      return clean;
    }
    const key = `${sourceType}${KEY_SEP}${sourceSlug}`;
    const id = keyToId.get(key);
    if (id === undefined) {
      unmatchedKeys.add(key);
      return clean;
    }
    matchedKeys.add(key);
    return {
      ...clean,
      assetId: id,
      tenantId: assets.find((a) => a.id === id)?.tenantId ?? clean.tenantId,
      // Re-key the dedup id to the new asset so two source rows that reconcile onto
      // the same (asset, date, model) collapse to one in applyTelemetry.
      id: `claude-code:${id}:${clean.date}:${clean.model ?? "unknown"}`,
    };
  });

  return {
    rows: out,
    matchedKeys: [...matchedKeys],
    unmatchedKeys: [...unmatchedKeys],
  };
}
