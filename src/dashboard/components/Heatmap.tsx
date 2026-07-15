export interface HeatmapCell {
  row: string;
  col: string;
  count: number;
  /** 0..1 drives the cell tint (here: average maturity). */
  intensity: number;
}

/**
 * Key a cell by its (row, col) pair. The separator is a newline, which cannot
 * appear in a single-line pillar or capability name, so distinct pairs never
 * collide. One helper is used to build and to read the map so the two sites can
 * never drift to different separators.
 */
const cellKey = (row: string, col: string): string => `${row}\n${col}`;

/**
 * A dual-encoded coverage grid: cell tint maps avg maturity, the number maps
 * asset count. The accent alpha is capped so the foreground readout stays legible
 * on both themes, and every cell carries a title for the precise figures. Column
 * headers are set vertical so every capability name reads in full instead of
 * truncating, and the grid sits in an x-scroll so a wide capability axis never
 * blows out the layout.
 *
 * Overflow is made discoverable and reachable on the same pattern as DataTable:
 * a right-edge gradient fade overlays the scroll region so a wide capability axis
 * reads as "more to the right", and the pillar row-header column is pinned to the
 * left edge (sticky) so the row labels stay in view while the matrix scrolls.
 */
export function Heatmap({
  rows,
  cols,
  cells,
  rowHeader = '',
  emptyLabel = 'no assets',
}: {
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
  rowHeader?: string;
  colHeader?: string;
  emptyLabel?: string;
}) {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.row, cell.col), cell]));
  const template = `minmax(6.5rem, max-content) repeat(${cols.length}, 2.75rem)`;

  return (
    <div className="relative max-w-full after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-surface">
      <div
        aria-label={`${rowHeader || 'coverage'} matrix`}
        className="max-w-full overflow-x-auto overscroll-x-contain pb-1"
        role="region"
        tabIndex={0}
      >
        <div className="grid w-max gap-1" style={{ gridTemplateColumns: template }}>
          <div className="eyebrow sticky left-0 z-[2] flex items-end bg-surface px-1 pb-1">{rowHeader}</div>
          {cols.map((col) => (
            <div className="flex items-end justify-center px-0.5 pb-1" key={col} title={col}>
              <span className="rotate-180 whitespace-nowrap font-mono text-[0.625rem] uppercase tracking-wide text-subtle [writing-mode:vertical-rl]">
                {col}
              </span>
            </div>
          ))}

          {rows.map((row) => (
            <FragmentRow byKey={byKey} cols={cols} emptyLabel={emptyLabel} key={row} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  cols,
  byKey,
  emptyLabel,
}: {
  row: string;
  cols: string[];
  byKey: Map<string, HeatmapCell>;
  emptyLabel: string;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-[1] flex items-center truncate bg-surface pr-2 text-right text-sm font-medium text-fg"
        title={row}
      >
        <span className="w-full truncate">{row}</span>
      </div>
      {cols.map((col) => {
        const cell = byKey.get(cellKey(row, col));
        const count = cell?.count ?? 0;
        const alpha = count > 0 ? 0.12 + 0.46 * Math.max(0, Math.min(1, cell?.intensity ?? 0)) : 0;
        const maturity = Math.round((cell?.intensity ?? 0) * 100);
        return (
          <div
            className="flex h-11 items-center justify-center rounded-md border border-border"
            key={col}
            style={count > 0 ? { background: `rgb(var(--accent-rgb) / ${alpha})` } : { background: 'var(--surface-inset)' }}
            title={count > 0 ? `${row} / ${col}: ${count} assets, maturity ${maturity}%` : `${row} / ${col}: ${emptyLabel}`}
          >
            <span className={`font-mono text-sm font-semibold tabular-nums ${count > 0 ? 'text-fg' : 'text-subtle/60'}`}>
              {count > 0 ? count : '·'}
            </span>
          </div>
        );
      })}
    </>
  );
}
