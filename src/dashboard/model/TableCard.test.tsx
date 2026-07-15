import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TableCard } from './TableCard';
import type { TableSignal } from './signals';
import { TABLES } from './modelMeta';

const signal: TableSignal = {
  assetCount: 30,
  governedRate: 0.67,
  effectiveRate: 0.33,
  errorRate: 0.1,
  staleCount: 2,
  invocations: 540,
  series: [3, 5, 4, 6],
  hasTelemetry: true,
};

const rect = { x: 10, y: 20, width: 240, height: 200 };
const noop = () => undefined;

function renderCard(overrides: Partial<Parameters<typeof TableCard>[0]> = {}) {
  return render(
    <TableCard
      animatePosition
      count={24}
      dimmed={false}
      meta={TABLES.Asset}
      onHeaderPointerDown={noop}
      onHeaderPointerMove={noop}
      onHeaderPointerUp={noop}
      onHoverChange={noop}
      onSelect={noop}
      rect={rect}
      selected={false}
      {...overrides}
    />
  );
}

describe('TableCard', () => {
  it('exposes an accessible name with the live count', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Asset table, 24 rows' })).toBeInTheDocument();
  });

  it('renders group labels and a tenant partition chip', () => {
    renderCard();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('tenant')).toBeInTheDocument();
  });

  it('selects on click and on Enter', async () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });
    const card = screen.getByRole('button', { name: 'Asset table, 24 rows' });
    await userEvent.click(card);
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('styles join tables with a dashed border and no tenant chip', () => {
    const { container } = render(
      <TableCard
        animatePosition
        count={3}
        dimmed={false}
        meta={TABLES.AssetTag}
        onHeaderPointerDown={noop}
        onHeaderPointerMove={noop}
        onHeaderPointerUp={noop}
        onHoverChange={noop}
        onSelect={noop}
        rect={rect}
        selected={false}
      />
    );
    expect((container.firstChild as HTMLElement).className).toContain('border-dashed');
    expect(screen.queryByText('tenant')).not.toBeInTheDocument();
  });

  it('carries a keyboard focus ring class', () => {
    renderCard();
    const card = screen.getByRole('button', { name: 'Asset table, 24 rows' });
    expect(card.className).toContain('focus-visible:outline-accent');
  });

  it('renders an operational signal slot when a signal is provided', () => {
    renderCard({ signal });
    expect(screen.getByText('Gov 67%')).toBeInTheDocument();
    expect(screen.getByText('Eff 33%')).toBeInTheDocument();
    expect(screen.getByText('Err 10%')).toBeInTheDocument();
    expect(screen.getByText('2 stale')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /invocations/ })).toBeInTheDocument();
  });

  it('shows no telemetry distinct from a measured zero', () => {
    renderCard({ signal: { ...signal, invocations: 0, errorRate: 0, series: [], hasTelemetry: false } });
    expect(screen.getByText('No telemetry')).toBeInTheDocument();
    expect(screen.queryByText(/Err /)).not.toBeInTheDocument();
  });

  it('omits the signal slot when no signal is provided', () => {
    renderCard();
    expect(screen.queryByText(/Gov /)).not.toBeInTheDocument();
  });

  it('adds a health status chip on the hub in the Health view', () => {
    // signal.errorRate is 0.1, so the derived status is at-risk.
    renderCard({ signal, health: true });
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });

  it('omits the health status chip when the Health view is off', () => {
    renderCard({ signal });
    expect(screen.queryByText('At risk')).not.toBeInTheDocument();
  });
});
