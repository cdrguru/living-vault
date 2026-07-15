// src/dashboard/monitor/subgraph.ts

/**
 * The one-hop dependency neighborhood of a node: the node itself plus every direct
 * neighbor across the given edges. The caller passes the currently visible edges
 * (tagged edges only when the Tag-edges toggle is on), so deep transitive chains
 * never re-enter and the focus set stays small.
 *
 * Edges are typed by their endpoints only ({ from, to }), so this helper serves
 * both the monitor topology graph and the dependency graph without importing a
 * specific edge model.
 */
export function neighborhood(
  selectedId: string,
  edges: { from: string; to: string }[],
): Set<string> {
  const set = new Set<string>([selectedId]);
  for (const edge of edges) {
    if (edge.from === selectedId) set.add(edge.to);
    else if (edge.to === selectedId) set.add(edge.from);
  }
  return set;
}
