import pricingRaw from './imports/pricing.json';
import type { HarnessMetricQuality, HarnessUsage, TokenComponents } from './types';

/**
 * Estimated per-model token prices, loaded from the committed pricing.json. List
 * prices are public, so this file ships in every build (no demo or local split).
 * The whole cost estimate is derived: each model's tokens are priced at that
 * model's rate and summed, never metered billing. Edit pricing.json to retune.
 */
export interface ComponentRateEntry {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

export interface Pricing {
  note: string;
  asOf: string;
  currency: string;
  perMillionTokens: Record<string, number>;
  // Per-model component rates. The `| string` admits a single `note` sentinel key in
  // the JSON (documentation); componentEntry() skips non-object values at lookup.
  componentRates?: Record<string, ComponentRateEntry | string>;
}

export const pricing = pricingRaw as Pricing;

/** Self-hosted providers cost nothing per token (local inference). */
const LOCAL_PREFIXES = ['lmstudio/', 'ollama/', 'local/'];

/**
 * Canonicalize a model id so a variant still prices: lowercase, drop a provider
 * prefix (azure/, anthropic/, mistral/...), an `@quantization` suffix, a trailing
 * `-latest`, and a trailing date stamp (`-20251001`). Keeps the family + version.
 */
function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/^[a-z0-9_.-]+\//, '')
    .replace(/@.*$/, '')
    .replace(/-latest$/, '')
    .replace(/-\d{6,8}$/, '');
}

/** A family fallback for a model with no exact or normalized entry, else null. */
function familyRate(
  norm: string,
  table: Record<string, number>,
): number | null {
  const at = (key: string): number | null => (key in table ? table[key] : null);
  if (norm.includes('deepseek')) return 0; // typically self-hosted
  if (norm.includes('opus')) return at('claude-opus-4-8');
  if (norm.includes('sonnet')) return at('claude-sonnet-4-6');
  if (norm.includes('haiku')) return at('claude-haiku-4-5');
  if (norm.includes('fable')) return at('claude-fable-5');
  if (norm.includes('codestral')) return at('mistral-codestral');
  if (norm.includes('gemini'))
    return at(norm.includes('flash') ? 'gemini-flash' : 'gemini-pro');
  if (norm.includes('grok')) return at('grok-build');
  if (norm.startsWith('gpt-5')) return at('gpt-5');
  return null;
}

/**
 * The list rate for ONE model in USD per million tokens. Resolution order: a
 * self-hosted local model is free; then an exact id match; then a normalized
 * match (provider / date / quantization stripped); then a model-family fallback;
 * then the default rate. A null model (none recorded) takes the default.
 */
export function modelRate(model: string | null, p: Pricing = pricing): number {
  const table = p.perMillionTokens;
  const fallback = table.default ?? 0;
  if (!model) return fallback;
  if (LOCAL_PREFIXES.some((prefix) => model.startsWith(prefix))) return 0;
  if (model in table) return table[model];
  const norm = normalizeModel(model);
  if (norm in table) return table[norm];
  const fam = familyRate(norm, table);
  return fam ?? fallback;
}

/** A model's fully-resolved per-component list rates (USD per 1M tokens). */
export interface ComponentRate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

/**
 * The componentRates key for a model family, or null when none applies. Intentionally
 * parallels familyRate()'s Claude arms (opus/sonnet/haiku/fable) — only Claude carries
 * a component split today; every other family falls back to the blended modelRate().
 * Keep in sync with familyRate() if a new Claude family is added.
 */
function familyComponentKey(norm: string): string | null {
  if (norm.includes('opus')) return 'claude-opus-4-8';
  if (norm.includes('sonnet')) return 'claude-sonnet-4-6';
  if (norm.includes('haiku')) return 'claude-haiku-4-5';
  if (norm.includes('fable')) return 'claude-fable-5';
  return null;
}

function componentEntry(model: string, p: Pricing): ComponentRateEntry | null {
  const table = p.componentRates;
  if (!table) return null;
  const pick = (key: string): ComponentRateEntry | null => {
    const v = table[key];
    return v && typeof v === 'object' ? v : null;
  };
  const fam = familyComponentKey(normalizeModel(model));
  return pick(model) ?? pick(normalizeModel(model)) ?? (fam ? pick(fam) : null);
}

/**
 * A model's per-component rates. Order: self-hosted local is free; then an explicit
 * componentRates entry (with cacheWrite/cacheRead derived from input when omitted);
 * else the blended modelRate() applied uniformly with the standard cache multipliers.
 */
export function resolveComponentRate(
  model: string | null,
  p: Pricing = pricing,
): ComponentRate {
  if (model && LOCAL_PREFIXES.some((prefix) => model.startsWith(prefix))) {
    return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  }
  const entry = model ? componentEntry(model, p) : null;
  if (entry) {
    return {
      input: entry.input,
      output: entry.output,
      cacheWrite: entry.cacheWrite ?? entry.input * CACHE_WRITE_MULT,
      cacheRead: entry.cacheRead ?? entry.input * CACHE_READ_MULT,
    };
  }
  const r = modelRate(model, p);
  return {
    input: r,
    output: r,
    cacheWrite: r * CACHE_WRITE_MULT,
    cacheRead: r * CACHE_READ_MULT,
  };
}

/**
 * How modelRate() resolved a model's price, for the "all models tracked" guard.
 * Anything but "default" means the model is priced intentionally rather than
 * falling through to the generic default rate.
 */
export type PriceProvenance = 'local' | 'exact' | 'normalized' | 'family' | 'default';

export function priceProvenance(model: string | null, p: Pricing = pricing): PriceProvenance {
  if (!model) return 'default';
  if (LOCAL_PREFIXES.some((prefix) => model.startsWith(prefix))) return 'local';
  const table = p.perMillionTokens;
  if (model in table) return 'exact';
  if (normalizeModel(model) in table) return 'normalized';
  if (familyRate(normalizeModel(model), table) !== null) return 'family';
  return 'default';
}

/** One model's slice of a harness's estimated spend. */
export interface ModelSpend {
  model: string;
  tokens: number;
  /** Dollars per million tokens applied to this model. */
  rate: number;
  /** Estimated spend in USD for this model's tokens. */
  cost: number;
  /** Cache-read tokens for this model (excluded from `tokens`), for UI display. */
  cacheReadTokens?: number;
}

/** One harness's estimated spend and efficiency, derived from its token usage. */
export interface HarnessSpend {
  source: string;
  label: string;
  /** Dominant model by tokens, for compact display (null when none recorded). */
  model: string | null;
  /** Number of distinct models priced for this harness. */
  modelCount: number;
  /** Blended dollars per million tokens (total cost / total tokens). */
  rate: number;
  tokens: number;
  successes: number;
  invocations: number;
  /** Estimated spend in USD: the sum of each model's tokens at its own rate. */
  cost: number;
  /** Estimated dollars per successful outcome, or null when not estimable. */
  costPerSuccess: number | null;
  /** False when the harness has no tokens to price in this window. */
  priced: boolean;
  /**
   * Whether the harness logs token counts at all (tracked.tokens !== 'none').
   * Lets the UI separate "never logs tokens" from "logs tokens but none in this
   * window" when a harness is unpriced.
   */
  logsTokens: boolean;
  /** Honesty of the estimate: derived (full tokens), partial (rough), none. */
  quality: HarnessMetricQuality;
  /** Per-model breakdown, scaled to the harness token total, sorted by cost. */
  byModel: ModelSpend[];
}

/** The cost estimate is at best as honest as the token count it is derived from. */
function costQuality(tokenQuality: HarnessMetricQuality): HarnessMetricQuality {
  if (tokenQuality === 'full') return 'derived';
  if (tokenQuality === 'none') return 'none';
  return 'partial';
}

/**
 * The per-model token split to price. Prefers the recorded tokensByModel; for a
 * legacy snapshot without it, attributes the whole token total to the primary
 * model (the prior behavior), or to "unknown" when no model is recorded.
 */
function tokensByModelFor(source: HarnessUsage): Record<string, number> {
  const recorded = source.tokensByModel;
  if (recorded && Object.keys(recorded).length > 0) return recorded;
  if (source.tokens <= 0) return {};
  return { [source.models[0] ?? 'unknown']: source.tokens };
}

/**
 * Price a harness from its whole-history component split, scaled to the (windowed)
 * billable token total. Returns null when the source carries no componentsByModel,
 * so the caller keeps the blended path. Cache reads are priced but excluded from the
 * billable scale base (they are not in source.tokens).
 */
function componentByModelSpend(
  source: HarnessUsage,
  p: Pricing,
): { byModel: ModelSpend[]; cost: number } | null {
  const comps = source.componentsByModel;
  if (!comps || Object.keys(comps).length === 0) return null;
  const billableOf = (c: TokenComponents) => c.input + c.output + c.cacheWrite;
  const billableTotal = Object.values(comps).reduce(
    (sum, c) => sum + billableOf(c),
    0,
  );
  const scale = billableTotal > 0 ? source.tokens / billableTotal : 0;
  const byModel: ModelSpend[] = Object.entries(comps)
    .map(([model, c]) => {
      const r = resolveComponentRate(model, p);
      const cost =
        (scale *
          (c.input * r.input +
            c.output * r.output +
            c.cacheWrite * r.cacheWrite +
            c.cacheRead * r.cacheRead)) /
        1_000_000;
      const tokens = scale * billableOf(c);
      const rate = tokens > 0 ? cost / (tokens / 1_000_000) : 0;
      return { model, tokens, rate, cost, cacheReadTokens: scale * c.cacheRead };
    })
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  const cost = byModel.reduce((sum, m) => sum + m.cost, 0);
  return { byModel, cost };
}

/**
 * Estimated spend per harness, pricing EACH model at its own rate and summing,
 * ranked most efficient first (lowest cost per success), with unpriced harnesses
 * last. The recorded per-model token mix is whole-history; it is scaled to the
 * (possibly windowed) token total so the breakdown always sums to it. Pure: reads
 * the passed sources and pricing only. A harness that logs no tokens
 * (tracked.tokens === 'none' or zero tokens) is returned unpriced rather than as
 * a misleading zero-cost row.
 */
export function harnessSpend(
  sources: HarnessUsage[],
  p: Pricing = pricing,
): HarnessSpend[] {
  const rows = sources.map((source): HarnessSpend => {
    const priced = source.tracked.tokens !== 'none' && source.tokens > 0;
    const comp = priced ? componentByModelSpend(source, p) : null;

    let byModel: ModelSpend[];
    let cost: number;
    if (comp) {
      byModel = comp.byModel;
      cost = comp.cost;
    } else {
      const mix = tokensByModelFor(source);
      const mixTotal = Object.values(mix).reduce((sum, t) => sum + t, 0);
      const scale = mixTotal > 0 ? source.tokens / mixTotal : 0;
      byModel = priced
        ? Object.entries(mix)
            .map(([model, raw]) => {
              const tokens = raw * scale;
              const rate = modelRate(model, p);
              return { model, tokens, rate, cost: (tokens / 1_000_000) * rate };
            })
            .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)
        : [];
      cost = byModel.reduce((sum, m) => sum + m.cost, 0);
    }

    const rate = source.tokens > 0 ? cost / (source.tokens / 1_000_000) : 0;
    const dominant = [...byModel].sort((a, b) => b.tokens - a.tokens)[0]?.model;
    const model = dominant ?? source.models[0] ?? null;
    const costPerSuccess = priced && source.successes > 0 ? cost / source.successes : null;

    return {
      source: source.source,
      label: source.label,
      model,
      modelCount: byModel.length,
      rate,
      tokens: source.tokens,
      successes: source.successes,
      invocations: source.invocations,
      cost,
      costPerSuccess,
      priced,
      logsTokens: source.tracked.tokens !== 'none',
      quality: priced ? (comp ? 'modeled' : costQuality(source.tracked.tokens)) : 'none',
      byModel,
    };
  });
  return rows.sort((a, b) => {
    if (a.priced !== b.priced) return a.priced ? -1 : 1;
    if (a.costPerSuccess === null) return b.costPerSuccess === null ? 0 : 1;
    if (b.costPerSuccess === null) return -1;
    return a.costPerSuccess - b.costPerSuccess;
  });
}

/** Fleet rollup across the priced harnesses only. */
export interface HarnessSpendTotals {
  cost: number;
  successes: number;
  costPerSuccess: number | null;
  pricedCount: number;
  totalCount: number;
}

export function harnessSpendTotals(spend: HarnessSpend[]): HarnessSpendTotals {
  const priced = spend.filter((row) => row.priced);
  const cost = priced.reduce((sum, row) => sum + row.cost, 0);
  const successes = priced.reduce((sum, row) => sum + row.successes, 0);
  return {
    cost,
    successes,
    costPerSuccess: successes ? cost / successes : null,
    pricedCount: priced.length,
    totalCount: spend.length,
  };
}
