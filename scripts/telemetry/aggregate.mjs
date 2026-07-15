/**
 * Group resolved events by (assetId, date, model) into UtilizationRow values with
 * deterministic ids. Only invocations, successes, errors, and latency are real in
 * Phase 1; refusals, tokens, and cost are fixed at 0. Events with no model default
 * to "unknown" so pre-model snapshots and non-tool events still aggregate.
 *
 * @param {Array<{ assetId, tenantId, date, model?: string, isError?: boolean, latencyMs?: number }>} events
 */
export function aggregate(events) {
  const groups = new Map();
  for (const event of events) {
    const model = event.model ?? 'unknown';
    const key = `${event.assetId}:${event.date}:${model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  const rows = [];
  for (const [, items] of groups) {
    const first = items[0];
    const model = first.model ?? 'unknown';
    const withResult = items.filter((e) => e.isError !== undefined);
    const latencies = items.map((e) => e.latencyMs).filter((ms) => typeof ms === 'number');
    const meanLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    rows.push({
      id: `claude-code:${first.assetId}:${first.date}:${model}`,
      tenantId: first.tenantId,
      assetId: first.assetId,
      date: first.date,
      model,
      invocations: items.length,
      successes: withResult.filter((e) => e.isError === false).length,
      errors: withResult.filter((e) => e.isError === true).length,
      refusals: 0,
      latencyMs: meanLatency,
      tokens: 0,
      cost: 0,
    });
  }
  return rows;
}
