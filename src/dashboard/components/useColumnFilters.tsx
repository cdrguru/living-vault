import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ColumnFilter } from './ColumnFilter';
import {
  activeFilterCount,
  applyColumnFilters,
  clearAllFilters,
  clearColumn,
  emptyColumnFilterState,
  isColumnActive,
  optionsFor,
  setQuery,
  toggleSelected,
  type ColumnFilterDef,
  type ColumnFilterState,
} from './columnFilters';

export interface ColumnFilterView<Row> {
  /** The rows passing every active column filter. */
  rows: Row[];
  /** Render the funnel control for a column key (null if the key is not filterable). */
  filterFor: (key: string) => ReactNode;
  /** How many columns currently constrain the rows. */
  activeCount: number;
}

export interface UseColumnFilters<Row> {
  /**
   * Bind the held filter state to a concrete row list, producing the filtered
   * rows and the per-column funnel renderers. Pure and cheap, so it is safe to
   * call after a component's early returns (unlike the hook itself).
   */
  bind: (rows: Row[]) => ColumnFilterView<Row>;
  /** Clear every column filter at once. */
  clearAll: () => void;
  /** Active-column count from the current state (independent of any row list). */
  activeCount: number;
  /** Stable signature of the current filter state, for animation/effect deps. */
  signature: string;
}

/**
 * Holds per-column header-filter state for one table and renders the funnels.
 * Call it unconditionally at the top of a page (it is a hook), then call `bind`
 * with the page's row list wherever the rows become available.
 *
 * `onBeforeChange` fires immediately before any state change, so a page that
 * animates row reordering (e.g. the Effectiveness ranking) can capture its Flip
 * state first.
 */
export function useColumnFilters<Row>(
  defs: ColumnFilterDef<Row>[],
  options?: { onBeforeChange?: () => void },
): UseColumnFilters<Row> {
  const [state, setState] = useState<ColumnFilterState>(emptyColumnFilterState);
  const onBeforeChange = options?.onBeforeChange;

  const update = useCallback(
    (next: ColumnFilterState) => {
      onBeforeChange?.();
      setState(next);
    },
    [onBeforeChange],
  );

  const clearAll = useCallback(() => {
    update(clearAllFilters());
  }, [update]);

  const activeCount = activeFilterCount(defs, state);
  const signature = useMemo(() => JSON.stringify(state), [state]);

  const bind = useCallback(
    (rows: Row[]): ColumnFilterView<Row> => ({
      rows: applyColumnFilters(defs, rows, state),
      activeCount: activeFilterCount(defs, state),
      filterFor: (key: string): ReactNode => {
        const def = defs.find((d) => d.key === key);
        if (!def) return null;
        const active = isColumnActive(def, state);
        if (def.type === 'text') {
          return (
            <ColumnFilter
              active={active}
              label={def.label}
              mode="text"
              onClear={() => update(clearColumn(state, key))}
              onQuery={(next) => update(setQuery(state, key, next))}
              query={state.query[key] ?? ''}
            />
          );
        }
        return (
          <ColumnFilter
            active={active}
            label={def.label}
            mode="select"
            onClear={() => update(clearColumn(state, key))}
            onToggle={(value) => update(toggleSelected(state, key, value))}
            options={optionsFor(defs, def, rows, state)}
            selected={state.selected[key] ?? []}
          />
        );
      },
    }),
    [defs, state, update],
  );

  return { bind, clearAll, activeCount, signature };
}
