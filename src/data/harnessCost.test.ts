import { describe, expect, it } from 'vitest';

import {
  harnessSpend,
  harnessSpendTotals,
  modelRate,
  priceProvenance,
  pricing,
  resolveComponentRate,
  type Pricing,
} from './harnessCost';
import type { HarnessMetricQuality, HarnessUsage } from './types';

// Every model id observed across the six harnesses (claude / codex / grok /
// gemini / continue / copilot). The shipped pricing.json must price each one
// explicitly, by normalized id, by family, or as a free local model: NONE may
// fall through to the bare default rate, or "all models tracked" has regressed.
const OBSERVED_MODELS = [
  // codex (OpenAI gpt-5 family + the auto-review label)
  'codex-auto-review', 'gpt-5', 'gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-5.3-codex', 'gpt-5.4',
  'gpt-5.4-mini', 'gpt-5.5',
  // claude-code
  'claude-fable-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-6', 'claude-opus-4-7',
  'claude-opus-4-8', 'claude-sonnet-4-6',
  // grok
  'grok-4.20-0309-non-reasoning', 'grok-build', 'grok-composer-2.5-fast',
  // gemini
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview',
  // continue (provider-qualified; lmstudio are local)
  'anthropic/claude-3-5-sonnet-latest', 'azure/gpt-5',
  'lmstudio/deepseek-r1-distill-llama-70b', 'lmstudio/deepseek-r1-distill-qwen-32b@q5_k_s',
  'lmstudio/deepseek-r1-distill-qwen-7b', 'mistral/codestral-latest',
  // copilot (dotted variants)
  'claude-sonnet-4.6', 'gpt-5.4',
];

const PRICING: Pricing = {
  note: 'test',
  asOf: '2026-06',
  currency: 'USD',
  perMillionTokens: {
    default: 6,
    'model-a': 5,
    'model-b': 3,
    'claude-sonnet-4-6': 6,
    'gpt-5': 4,
  },
};

function harness(
  source: string,
  over: Partial<HarnessUsage> & { tokensQuality: HarnessMetricQuality },
): HarnessUsage {
  return {
    source,
    label: source,
    sessions: 0,
    windowStart: null,
    windowEnd: null,
    invocations: over.invocations ?? 0,
    successes: over.successes ?? 0,
    errors: 0,
    latencyMs: 0,
    tokens: over.tokens ?? 0,
    cost: 0,
    models: over.models ?? [],
    tokensByModel: over.tokensByModel,
    tracked: {
      successes: 'full',
      errors: 'full',
      latency: 'full',
      tokens: over.tokensQuality,
      cost: 'none',
    },
  };
}

describe('modelRate', () => {
  it('matches an exact model id', () => {
    expect(modelRate('model-a', PRICING)).toBe(5);
  });

  it('strips a provider prefix before matching', () => {
    expect(modelRate('azure/gpt-5', PRICING)).toBe(4);
  });

  it('falls back to the model family for a punctuation variant', () => {
    // claude-sonnet-4.6 (Copilot, dotted) has no exact key but is a Sonnet.
    expect(modelRate('claude-sonnet-4.6', PRICING)).toBe(6);
  });

  it('prices a self-hosted local model at zero', () => {
    expect(modelRate('lmstudio/deepseek-r1-distill-qwen-7b', PRICING)).toBe(0);
  });

  it('falls back to the default rate for an unknown model and for null', () => {
    expect(modelRate('who-knows', PRICING)).toBe(6);
    expect(modelRate(null, PRICING)).toBe(6);
  });
});

describe('shipped pricing covers every observed model', () => {
  it.each(OBSERVED_MODELS)('prices %s without falling to the bare default', (model) => {
    expect(priceProvenance(model, pricing)).not.toBe('default');
  });

  it('reports how each model resolved (exact / normalized / family / local)', () => {
    expect(priceProvenance('gpt-5', pricing)).toBe('exact');
    expect(priceProvenance('azure/gpt-5', pricing)).toBe('normalized');
    expect(priceProvenance('claude-sonnet-4.6', pricing)).toBe('family');
    expect(priceProvenance('lmstudio/deepseek-r1-distill-qwen-7b', pricing)).toBe('local');
  });
});

describe('harnessSpend per-model pricing', () => {
  it('prices each model at its own rate and sums them (not one blended models[0] rate)', () => {
    const [row] = harnessSpend(
      [
        harness('codex', {
          tokens: 20_000_000,
          tokensByModel: { 'model-a': 10_000_000, 'model-b': 10_000_000 },
          successes: 100,
          tokensQuality: 'full',
        }),
      ],
      PRICING,
    );
    expect(row.priced).toBe(true);
    expect(row.cost).toBeCloseTo(80, 6); // 10M*5 + 10M*3 = 50 + 30
    expect(row.rate).toBeCloseTo(4, 6); // blended: 80 / 20M
    expect(row.modelCount).toBe(2);
    expect(row.costPerSuccess).toBeCloseTo(0.8, 6); // 80 / 100
  });

  it('exposes a per-model breakdown sorted by cost, each priced at its model rate', () => {
    const [row] = harnessSpend(
      [
        harness('codex', {
          tokens: 20_000_000,
          tokensByModel: { 'model-b': 10_000_000, 'model-a': 10_000_000 },
          tokensQuality: 'full',
        }),
      ],
      PRICING,
    );
    expect(row.byModel.map((m) => m.model)).toEqual(['model-a', 'model-b']);
    expect(row.byModel[0]).toMatchObject({ model: 'model-a', tokens: 10_000_000, rate: 5, cost: 50 });
    expect(row.byModel[1]).toMatchObject({ model: 'model-b', tokens: 10_000_000, rate: 3, cost: 30 });
  });

  it('scales the per-model mix to a narrowed (windowed) token total', () => {
    // Whole-history mix sums to 20M but the windowed total is only 10M: the
    // breakdown scales proportionally and cost halves, blended rate unchanged.
    const [row] = harnessSpend(
      [
        harness('codex', {
          tokens: 10_000_000,
          tokensByModel: { 'model-a': 10_000_000, 'model-b': 10_000_000 },
          tokensQuality: 'full',
        }),
      ],
      PRICING,
    );
    expect(row.cost).toBeCloseTo(40, 6); // half of 80
    expect(row.rate).toBeCloseTo(4, 6);
    expect(row.byModel[0].tokens).toBeCloseTo(5_000_000, 0);
  });

  it('prices an all-local harness as priced with zero cost', () => {
    const [row] = harnessSpend(
      [
        harness('continue', {
          tokens: 5_000_000,
          tokensByModel: { 'lmstudio/deepseek-r1-distill-qwen-7b': 5_000_000 },
          successes: 10,
          tokensQuality: 'full',
        }),
      ],
      PRICING,
    );
    expect(row.priced).toBe(true);
    expect(row.cost).toBe(0);
    expect(row.costPerSuccess).toBe(0);
  });

  it('falls back to the primary model for a legacy snapshot with no tokensByModel', () => {
    const [row] = harnessSpend(
      [harness('a', { models: ['model-a'], tokens: 10_000_000, successes: 200, tokensQuality: 'full' })],
      PRICING,
    );
    expect(row.cost).toBeCloseTo(50, 6); // all tokens at model-a
    expect(row.rate).toBe(5);
    expect(row.modelCount).toBe(1);
    expect(row.model).toBe('model-a');
  });

  it('distinguishes a token-logging harness idle in the window from one that never logs tokens', () => {
    const [idle] = harnessSpend(
      [harness('gemini', { models: ['model-a'], tokens: 0, tokensQuality: 'full' })],
      PRICING,
    );
    expect(idle.priced).toBe(false);
    expect(idle.logsTokens).toBe(true); // logs tokens, just none in this window

    const [tokenless] = harnessSpend(
      [harness('claude', { tokens: 0, tokensQuality: 'none' })],
      PRICING,
    );
    expect(tokenless.priced).toBe(false);
    expect(tokenless.logsTokens).toBe(false);
  });

  it('leaves a harness that logs no tokens unpriced rather than a zero-cost row', () => {
    const [row] = harnessSpend(
      [harness('claude', { models: [], tokens: 0, successes: 500, tokensQuality: 'none' })],
      PRICING,
    );
    expect(row.priced).toBe(false);
    expect(row.cost).toBe(0);
    expect(row.costPerSuccess).toBeNull();
    expect(row.quality).toBe('none');
    expect(row.byModel).toEqual([]);
  });

  it('flags a partial-token estimate as partial quality', () => {
    const [row] = harnessSpend(
      [harness('grok', { models: ['model-b'], tokens: 4_000_000, successes: 100, tokensQuality: 'partial' })],
      PRICING,
    );
    expect(row.priced).toBe(true);
    expect(row.quality).toBe('partial');
    expect(row.cost).toBeCloseTo(12, 6);
  });

  it('ranks most efficient first and sorts unpriced harnesses last', () => {
    const ranked = harnessSpend(
      [
        harness('expensive', { models: ['model-a'], tokens: 300_000_000, successes: 400, tokensQuality: 'full' }),
        harness('cheap', { models: ['model-b'], tokens: 4_000_000, successes: 780, tokensQuality: 'partial' }),
        harness('unpriced', { models: [], tokens: 0, successes: 600, tokensQuality: 'none' }),
      ],
      PRICING,
    );
    expect(ranked.map((row) => row.source)).toEqual(['cheap', 'expensive', 'unpriced']);
  });
});

describe('harnessSpendTotals', () => {
  it('rolls up cost and successes across priced harnesses only', () => {
    const totals = harnessSpendTotals(
      harnessSpend(
        [
          harness('a', { models: ['model-a'], tokens: 10_000_000, successes: 200, tokensQuality: 'full' }),
          harness('b', { models: ['model-b'], tokens: 4_000_000, successes: 100, tokensQuality: 'partial' }),
          harness('unpriced', { models: [], tokens: 0, successes: 999, tokensQuality: 'none' }),
        ],
        PRICING,
      ),
    );
    expect(totals.cost).toBeCloseTo(62, 6); // 50 + 12
    expect(totals.successes).toBe(300); // unpriced successes excluded
    expect(totals.costPerSuccess).toBeCloseTo(62 / 300, 6);
    expect(totals.pricedCount).toBe(2);
    expect(totals.totalCount).toBe(3);
  });
});

describe('component pricing', () => {
  it('resolves component rates with the explicit cited cache rates', () => {
    // Verified against the published Anthropic pricing page 2026-07-11: Opus 4.8
    // is $5 in / $25 out, cache read 0.1x, cache write 2x (the 1-hour TTL Claude
    // Code uses). The table once said 15/75, a 3x overstatement that penalized
    // Claude in every cost comparison.
    const r = resolveComponentRate('claude-opus-4-8');
    expect(r).toEqual({ input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 });
  });

  it('resolves cited component rates for non-Claude models too', () => {
    // gpt-5.4 list price (developers.openai.com, 2026-07-11): $2.50 in, $0.25
    // cached in, $15 out. Before this entry existed the blended $4 rate priced
    // its cached input 16x too high and its output 73% too low.
    expect(resolveComponentRate('gpt-5.4')).toEqual({
      input: 2.5,
      output: 15,
      cacheWrite: 3.125,
      cacheRead: 0.25,
    });
    // grok-build is the grok-4.5 alias grok-build-latest (docs.x.ai): $2 in,
    // $0.50 cached, $6 out.
    expect(resolveComponentRate('grok-build-latest')).toEqual({
      input: 2,
      output: 6,
      cacheWrite: 2.5,
      cacheRead: 0.5,
    });
  });

  it('falls back to the blended rate for a model with no component entry', () => {
    const r = resolveComponentRate('gpt-5');
    expect(r).toEqual({ input: 5, output: 5, cacheWrite: 6.25, cacheRead: 0.5 });
  });

  it('prices a harness from componentsByModel and marks it modeled', () => {
    const source: HarnessUsage = {
      source: 'claude-code',
      label: 'Claude Code',
      sessions: 1,
      windowStart: '2026-06-01',
      windowEnd: '2026-06-01',
      invocations: 1,
      successes: 1,
      errors: 0,
      latencyMs: 0,
      tokens: 1_000_000,
      cost: 0,
      models: ['claude-sonnet-4-6'],
      tokensByModel: { 'claude-sonnet-4-6': 1_000_000 },
      componentsByModel: {
        'claude-sonnet-4-6': {
          input: 400_000,
          output: 100_000,
          cacheWrite: 500_000,
          cacheRead: 2_000_000,
        },
      },
      tracked: {
        successes: 'full',
        errors: 'full',
        latency: 'full',
        tokens: 'full',
        cost: 'modeled',
      },
    };
    const [row] = harnessSpend([source]);
    // input 0.4M*3 + output 0.1M*15 + cacheWrite 0.5M*6 (1h-TTL 2x) + cacheRead 2M*0.3 = 6.30 USD
    expect(row.cost).toBeCloseTo(6.3, 3);
    expect(row.quality).toBe('modeled');
  });
});
