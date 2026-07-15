import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColumnFilter } from './ColumnFilter';

const typeOptions = [
  { value: 'skill', label: 'skill', count: 2 },
  { value: 'hook', label: 'hook', count: 1 },
];

describe('ColumnFilter (select mode)', () => {
  it('exposes a funnel trigger named for its column', () => {
    render(
      <ColumnFilter
        active={false}
        label="Type"
        mode="select"
        onClear={() => {}}
        onToggle={() => {}}
        options={typeOptions}
        selected={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /filter by type/i })).toBeTruthy();
  });

  it('opens a popover and toggles an option value', async () => {
    const onToggle = vi.fn();
    render(
      <ColumnFilter
        active={false}
        label="Type"
        mode="select"
        onClear={() => {}}
        onToggle={onToggle}
        options={typeOptions}
        selected={[]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filter by type/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /skill/i }));
    expect(onToggle).toHaveBeenCalledWith('skill');
  });

  it('reflects an applied filter in the trigger accessible name', () => {
    render(
      <ColumnFilter
        active
        label="Type"
        mode="select"
        onClear={() => {}}
        onToggle={() => {}}
        options={typeOptions}
        selected={['skill']}
      />,
    );
    expect(screen.getByRole('button', { name: /filter by type.*active/i })).toBeTruthy();
  });

  it('closes the popover on Escape', async () => {
    render(
      <ColumnFilter
        active={false}
        label="Type"
        mode="select"
        onClear={() => {}}
        onToggle={() => {}}
        options={typeOptions}
        selected={[]}
      />,
    );
    const trigger = screen.getByRole('button', { name: /filter by type/i });
    await userEvent.click(trigger);
    expect(screen.queryByRole('checkbox', { name: /skill/i })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox', { name: /skill/i })).toBeNull();
  });
});

describe('ColumnFilter (text mode)', () => {
  it('types into a contains search and reports each change', async () => {
    const onQuery = vi.fn();
    render(
      <ColumnFilter
        active={false}
        label="Asset"
        mode="text"
        onClear={() => {}}
        onQuery={onQuery}
        query=""
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filter by asset/i }));
    await userEvent.type(screen.getByRole('searchbox'), 'a');
    expect(onQuery).toHaveBeenCalledWith('a');
  });
});
