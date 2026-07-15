import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applyColumnFilters,
  clearAllFilters,
  clearColumn,
  emptyColumnFilterState,
  NONE_VALUE,
  optionsFor,
  setQuery,
  toggleSelected,
  type ColumnFilterDef,
  type ColumnFilterState,
} from './columnFilters';

interface Row {
  name: string;
  type: string;
  tier: string | null;
}

const rows: Row[] = [
  { name: 'Alpha', type: 'skill', tier: 'custom' },
  { name: 'Bravo', type: 'skill', tier: 'stock' },
  { name: 'Charlie', type: 'subagent', tier: 'custom' },
  { name: 'Delta', type: 'hook', tier: null },
];

const defs: ColumnFilterDef<Row>[] = [
  { key: 'name', label: 'Name', type: 'text', value: (r) => r.name },
  { key: 'type', label: 'Type', type: 'select', value: (r) => r.type },
  { key: 'tier', label: 'Tier', type: 'select', value: (r) => r.tier },
];

describe('applyColumnFilters', () => {
  it('returns all rows when no filter is active', () => {
    expect(applyColumnFilters(defs, rows, emptyColumnFilterState)).toHaveLength(4);
  });

  it('filters a select column to a single selected value', () => {
    const state: ColumnFilterState = { selected: { type: ['skill'] }, query: {} };
    expect(applyColumnFilters(defs, rows, state).map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('ORs multiple selected values within one column', () => {
    const state: ColumnFilterState = { selected: { type: ['subagent', 'hook'] }, query: {} };
    expect(applyColumnFilters(defs, rows, state).map((r) => r.name)).toEqual(['Charlie', 'Delta']);
  });

  it('matches a text column case-insensitively as a substring', () => {
    const state: ColumnFilterState = { selected: {}, query: { name: 'RA' } };
    expect(applyColumnFilters(defs, rows, state).map((r) => r.name)).toEqual(['Bravo']);
  });

  it('ANDs filters across columns', () => {
    const state: ColumnFilterState = { selected: { type: ['skill'], tier: ['custom'] }, query: {} };
    expect(applyColumnFilters(defs, rows, state).map((r) => r.name)).toEqual(['Alpha']);
  });

  it('treats a null column value as the NONE option', () => {
    const state: ColumnFilterState = { selected: { tier: [NONE_VALUE] }, query: {} };
    expect(applyColumnFilters(defs, rows, state).map((r) => r.name)).toEqual(['Delta']);
  });

  it('ignores an empty selection and a blank query', () => {
    const state: ColumnFilterState = { selected: { type: [] }, query: { name: '  ' } };
    expect(applyColumnFilters(defs, rows, state)).toHaveLength(4);
  });
});

// optionsFor takes a SelectColumnDef; narrow the heterogeneous defs for the calls below.
const typeDef = defs[1] as Extract<ColumnFilterDef<Row>, { type: 'select' }>;
const tierDef = defs[2] as Extract<ColumnFilterDef<Row>, { type: 'select' }>;

describe('optionsFor', () => {
  it('lists unique select values sorted, with NONE last', () => {
    const opts = optionsFor(defs, tierDef, rows, emptyColumnFilterState);
    expect(opts.map((o) => o.value)).toEqual(['custom', 'stock', NONE_VALUE]);
  });

  it('counts rows per option against other active columns', () => {
    const state: ColumnFilterState = { selected: { type: ['skill'] }, query: {} };
    const byVal = Object.fromEntries(
      optionsFor(defs, tierDef, rows, state).map((o) => [o.value, o.count]),
    );
    expect(byVal.custom).toBe(1);
    expect(byVal.stock).toBe(1);
    expect(byVal[NONE_VALUE]).toBe(0);
  });

  it('counts a column over the full set, ignoring its own selection', () => {
    const state: ColumnFilterState = { selected: { type: ['skill'] }, query: {} };
    const byVal = Object.fromEntries(
      optionsFor(defs, typeDef, rows, state).map((o) => [o.value, o.count]),
    );
    expect(byVal.skill).toBe(2);
    expect(byVal.subagent).toBe(1);
    expect(byVal.hook).toBe(1);
  });
});

describe('activeFilterCount', () => {
  it('counts columns with an active selection or query', () => {
    const state: ColumnFilterState = { selected: { type: ['skill'] }, query: { name: 'a' } };
    expect(activeFilterCount(defs, state)).toBe(2);
  });

  it('ignores empty selections and blank queries', () => {
    const state: ColumnFilterState = { selected: { type: [] }, query: { name: '  ' } };
    expect(activeFilterCount(defs, state)).toBe(0);
  });
});

describe('toggleSelected', () => {
  it('adds then removes a value, leaving the column inactive', () => {
    const s1 = toggleSelected(emptyColumnFilterState, 'type', 'skill');
    expect(s1.selected.type).toEqual(['skill']);
    const s2 = toggleSelected(s1, 'type', 'skill');
    expect(s2.selected.type ?? []).toEqual([]);
  });

  it('does not mutate the input state', () => {
    const s1 = toggleSelected(emptyColumnFilterState, 'type', 'skill');
    expect(emptyColumnFilterState.selected.type).toBeUndefined();
    expect(s1).not.toBe(emptyColumnFilterState);
  });
});

describe('setQuery and clearColumn', () => {
  it('sets a text query for a column', () => {
    const s = setQuery(emptyColumnFilterState, 'name', 'alpha');
    expect(s.query.name).toBe('alpha');
  });

  it('clears both the selection and query for one column only', () => {
    const seeded: ColumnFilterState = {
      selected: { type: ['skill'], tier: ['custom'] },
      query: { name: 'a' },
    };
    const cleared = clearColumn(seeded, 'type');
    expect(cleared.selected.type ?? []).toEqual([]);
    expect(cleared.selected.tier).toEqual(['custom']);
    expect(cleared.query.name).toBe('a');
  });
});

describe('clearAllFilters', () => {
  it('returns an empty state', () => {
    const seeded: ColumnFilterState = {
      selected: { type: ['skill'] },
      query: { name: 'a' },
    };
    expect(activeFilterCount(defs, clearAllFilters())).toBe(0);
    expect(clearAllFilters()).toEqual(emptyColumnFilterState);
    // sanity: the seeded state was indeed active before clearing
    expect(activeFilterCount(defs, seeded)).toBe(2);
  });
});
