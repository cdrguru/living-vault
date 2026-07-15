import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ColumnFilterDef } from './columnFilters';
import { useColumnFilters } from './useColumnFilters';

interface Row {
  name: string;
  type: string;
}

const rows: Row[] = [
  { name: 'Alpha', type: 'skill' },
  { name: 'Bravo', type: 'hook' },
];

const defs: ColumnFilterDef<Row>[] = [
  { key: 'name', label: 'Asset', type: 'text', value: (r) => r.name },
  { key: 'type', label: 'Type', type: 'select', value: (r) => r.type },
];

function Harness() {
  const filters = useColumnFilters(defs);
  const view = filters.bind(rows);
  return (
    <div>
      <span data-testid="active">{view.activeCount}</span>
      <table>
        <thead>
          <tr>
            <th>
              Asset {view.filterFor('name')}
            </th>
            <th>
              Type {view.filterFor('type')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe('useColumnFilters', () => {
  it('filters rows when a select value is checked', async () => {
    render(<Harness />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Bravo')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /filter by type/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^skill$/i }));

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Bravo')).toBeNull();
    expect(screen.getByTestId('active').textContent).toBe('1');
  });

  it('filters rows by a contains query', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /filter by asset/i }));
    await userEvent.type(screen.getByRole('searchbox'), 'brav');

    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Bravo')).toBeTruthy();
  });
});
