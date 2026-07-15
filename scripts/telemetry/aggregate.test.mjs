import { describe, expect, it } from 'vitest';

import { aggregate } from './aggregate.mjs';

const resolved = [
  { assetId: 'a1', tenantId: 't1', date: '2026-06-07', isError: false, latencyMs: 1000 },
  { assetId: 'a1', tenantId: 't1', date: '2026-06-07', isError: true, latencyMs: 3000 },
  { assetId: 'a1', tenantId: 't1', date: '2026-06-07', isError: undefined, latencyMs: undefined },
  { assetId: 'a1', tenantId: 't1', date: '2026-06-08', isError: false, latencyMs: 500 },
];

describe('aggregate', () => {
  it('produces one deterministic row per asset per day per model with real counts', () => {
    const rows = aggregate(resolved);
    const day7 = rows.find((r) => r.id === 'claude-code:a1:2026-06-07:unknown');
    expect(day7).toBeDefined();
    expect(day7.invocations).toBe(3);
    expect(day7.successes).toBe(1);
    expect(day7.errors).toBe(1);
    expect(day7.latencyMs).toBe(2000);
    expect({ refusals: day7.refusals, tokens: day7.tokens, cost: day7.cost }).toEqual({ refusals: 0, tokens: 0, cost: 0 });
    expect(rows.find((r) => r.id === 'claude-code:a1:2026-06-08:unknown').invocations).toBe(1);
  });

  it('keeps successes + errors + refusals <= invocations', () => {
    for (const row of aggregate(resolved)) {
      expect(row.successes + row.errors + row.refusals).toBeLessThanOrEqual(row.invocations);
    }
  });

  it('emits only whitelisted aggregate fields', () => {
    const keys = Object.keys(aggregate(resolved)[0]).sort();
    expect(keys).toEqual(['assetId', 'cost', 'date', 'errors', 'id', 'invocations', 'latencyMs', 'model', 'refusals', 'successes', 'tenantId', 'tokens']);
  });

  it('splits the same asset and day into one row per model', () => {
    const events = [
      { assetId: 'a1', tenantId: 't1', date: '2026-06-07', model: 'claude-opus-4-8', isError: false, latencyMs: 1000 },
      { assetId: 'a1', tenantId: 't1', date: '2026-06-07', model: 'claude-opus-4-8', isError: false, latencyMs: 2000 },
      { assetId: 'a1', tenantId: 't1', date: '2026-06-07', model: 'claude-sonnet-4-6', isError: true, latencyMs: 500 },
    ];
    const rows = aggregate(events);
    const opus = rows.find((r) => r.id === 'claude-code:a1:2026-06-07:claude-opus-4-8');
    const sonnet = rows.find((r) => r.id === 'claude-code:a1:2026-06-07:claude-sonnet-4-6');
    expect(opus.model).toBe('claude-opus-4-8');
    expect(opus.invocations).toBe(2);
    expect(opus.latencyMs).toBe(1500);
    expect(sonnet.model).toBe('claude-sonnet-4-6');
    expect(sonnet.invocations).toBe(1);
    expect(sonnet.errors).toBe(1);
  });
});
