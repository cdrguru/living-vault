import { describe, expect, it } from 'vitest';

import { seedDataset } from '@/data';
import {
  RELATIONSHIP_LIST,
  TABLE_IDS,
  TABLE_LIST,
  TABLES,
  edgesForMode,
  visibleTables,
  type EdgeDef,
} from './modelMeta';

describe('modelMeta tables', () => {
  it('describes all nine tables exactly once', () => {
    expect(TABLE_LIST).toHaveLength(9);
    expect(new Set(TABLE_LIST.map((table) => table.id)).size).toBe(9);
    for (const id of TABLE_IDS) expect(TABLES[id].id).toBe(id);
  });

  it('gives every table non-empty, duplicate-free field groups', () => {
    for (const table of TABLE_LIST) {
      expect(table.groups.length).toBeGreaterThan(0);
      const fields = table.groups.flatMap((group) => group.fields);
      expect(fields.length).toBeGreaterThan(0);
      expect(new Set(fields).size).toBe(fields.length);
    }
  });

  it('marks exactly the six tenant tables as partitioned', () => {
    const partitioned = TABLE_LIST.filter((table) => table.partitioned).map((t) => t.id);
    expect(partitioned.sort()).toEqual(
      ['Asset', 'Bundle', 'Origin', 'Owner', 'Tag', 'Utilization'].sort()
    );
  });

  it('counts rows from the dataset', () => {
    expect(TABLES.Asset.count(seedDataset)).toBe(seedDataset.assets.length);
    expect(TABLES.AssetDependency.count(seedDataset)).toBe(seedDataset.dependencies.length);
    expect(TABLES.Utilization.count(seedDataset)).toBe(seedDataset.utilization.length);
  });
});

describe('modelMeta relationships', () => {
  it('defines six relationships with valid endpoints', () => {
    expect(RELATIONSHIP_LIST).toHaveLength(6);
    for (const rel of RELATIONSHIP_LIST) {
      for (const end of rel.endpoints) expect(TABLE_IDS).toContain(end);
      if (rel.via) expect(TABLES[rel.via].role).toBe('join');
      expect(rel.explanation.length).toBeGreaterThan(20);
    }
  });

  it('computes live link counts', () => {
    const byId = Object.fromEntries(RELATIONSHIP_LIST.map((rel) => [rel.id, rel]));
    expect(byId['asset-tag'].count(seedDataset)).toBe(seedDataset.assetTags.length);
    expect(byId['asset-owner'].count(seedDataset)).toBe(
      seedDataset.assets.filter((asset) => asset.ownerId).length
    );
  });
});

describe('modelMeta modes', () => {
  it('shows 6 tables collapsed and 9 expanded', () => {
    expect(visibleTables('collapsed')).toHaveLength(6);
    expect(visibleTables('expanded')).toHaveLength(9);
  });

  it('keeps every edge endpoint visible in its mode', () => {
    for (const mode of ['collapsed', 'expanded'] as const) {
      const visible = new Set(visibleTables(mode));
      for (const edge of edgesForMode(mode)) {
        expect(visible.has(edge.from)).toBe(true);
        expect(visible.has(edge.to)).toBe(true);
      }
    }
  });

  it('collapsed mode has one self loop and two via pills', () => {
    const edges = edgesForMode('collapsed');
    expect(edges.filter((edge) => edge.selfLoop)).toHaveLength(1);
    expect(edges.filter((edge) => edge.pill?.includes('via'))).toHaveLength(2);
  });

  it('expanded mode reroutes joins into 1:many legs with offset dependency edges', () => {
    const edges = edgesForMode('expanded');
    expect(edges).toHaveLength(9);
    expect(edges.some((edge) => edge.selfLoop)).toBe(false);
    for (const id of ['assettag-asset', 'assettag-tag', 'membership-bundle', 'membership-asset']) {
      expect(edges.find((edge) => edge.id === id)).toBeDefined();
    }
    const dependencyEdges = edges.filter((edge) => edge.relationship === 'asset-dependency');
    expect(dependencyEdges).toHaveLength(2);
    const offsets = dependencyEdges.map((edge) => edge.offset);
    expect(offsets[0]).toBeDefined();
    expect(offsets[1]).toBeDefined();
    expect(offsets[0]!).toBe(-offsets[1]!);
    expect(offsets[0]).not.toBe(0);
  });
});

describe('EdgeDef pillIsCardinality', () => {
  function edgeById(id: string): EdgeDef {
    const edge = [...edgesForMode('collapsed'), ...edgesForMode('expanded')].find(
      (candidate) => candidate.id === id
    );
    if (!edge) throw new Error(`no edge ${id}`);
    return edge;
  }

  it('leaves the four expanded join legs without a pill', () => {
    for (const id of ['assettag-asset', 'assettag-tag', 'membership-bundle', 'membership-asset']) {
      const edge = edgeById(id);
      expect(edge.pill).toBeUndefined();
      expect(edge.pillIsCardinality).toBeUndefined();
    }
  });

  it('marks exactly the five cardinality pills', () => {
    for (const id of [
      'asset-owner',
      'asset-origin',
      'asset-utilization',
      'asset-tag',
      'bundle-asset',
    ]) {
      const edge = edgeById(id);
      expect(edge.pill).toBeTruthy();
      expect(edge.pillIsCardinality).toBe(true);
    }
  });

  it('keeps the field-name dependency pills and the self loop off the cardinality flag', () => {
    for (const id of ['dependency-source', 'dependency-target']) {
      const edge = edgeById(id);
      expect(edge.pill).toBeTruthy();
      expect(edge.pillIsCardinality).not.toBe(true);
    }
    const selfLoop = edgeById('asset-dependency');
    expect(selfLoop.selfLoop).toBe(true);
    expect(selfLoop.pillIsCardinality).not.toBe(true);
  });
});
