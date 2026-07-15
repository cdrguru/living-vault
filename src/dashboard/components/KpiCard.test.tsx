import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiCard } from './KpiCard';

/**
 * The delta chip announces its direction via the sr-only "<dir> versus the
 * prior period" text; favorability (green/red) is color-only, so that one
 * class lookup is centralized here instead of being sprinkled per test.
 */
function deltaChip(container: HTMLElement) {
  const srOnly = Array.from(container.querySelectorAll('.sr-only')).find((el) =>
    /versus the prior period/.test(el.textContent ?? ''),
  );
  if (!srOnly) return null;
  const chip = srOnly.parentElement as HTMLElement;
  const tone = chip.className.includes('text-success')
    ? 'good'
    : chip.className.includes('text-danger')
      ? 'bad'
      : 'neutral';
  const direction = /(up|down|flat) versus/.exec(srOnly.textContent ?? '')?.[1];
  return { chip, tone, direction };
}

describe('KpiCard', () => {
  it('renders label, value, and detail', () => {
    const { getByText } = render(<KpiCard detail="3 of 10" label="Stars" value="42%" />);
    expect(getByText('Stars')).toBeTruthy();
    expect(getByText('42%')).toBeTruthy();
    expect(getByText('3 of 10')).toBeTruthy();
  });

  it('omits the delta chip when no delta is supplied', () => {
    const { container } = render(<KpiCard label="Stars" value="7" />);
    expect(deltaChip(container)).toBeNull();
  });

  it('reads a rising metric as good by default', () => {
    const { container, getByText } = render(<KpiCard delta={0.12} label="Invocations" value="1,200" />);
    expect(getByText('12%')).toBeTruthy();
    expect(getByText('▲')).toBeTruthy();
    expect(deltaChip(container)).toMatchObject({ tone: 'good', direction: 'up' });
  });

  it('shows a neutral em-dash for a delta that rounds to zero percent', () => {
    const { container, getByText, queryByText } = render(
      <KpiCard delta={0.003} label="Success rate" value="80%" />
    );
    // A non-movement must not read as a green rise or a directional arrow.
    expect(queryByText('▲')).toBeNull();
    expect(queryByText('▼')).toBeNull();
    expect(queryByText('0%')).toBeNull();
    expect(getByText('-')).toBeTruthy();
    expect(deltaChip(container)).toMatchObject({ tone: 'neutral', direction: 'flat' });
  });

  it('reads a rising cost as bad when goodDirection is down', () => {
    const { container } = render(
      <KpiCard delta={0.2} goodDirection="down" label="Spend" value="$50" />
    );
    expect(deltaChip(container)).toMatchObject({ tone: 'bad', direction: 'up' });
  });

  it('reads a falling cost as good when goodDirection is down', () => {
    const { container } = render(
      <KpiCard delta={-0.2} goodDirection="down" label="Spend" value="$50" />
    );
    expect(deltaChip(container)).toMatchObject({ tone: 'good', direction: 'down' });
  });

  it('renders a sparkline when a trend is supplied', () => {
    const { getByRole } = render(
      <KpiCard label="Invocations" trend={[1, 4, 2, 6]} trendLabel="invocation trend" value="13" />
    );
    expect(getByRole('img', { name: 'invocation trend' })).toBeTruthy();
  });

  it('renders an info tooltip when an info key is supplied', () => {
    const { getByRole } = render(
      <KpiCard info="overview.invocations" label="Invocations" value="1,200" />
    );
    expect(getByRole('button', { name: 'About Invocations' })).toBeTruthy();
    expect(getByRole('tooltip')).toBeTruthy();
  });
});
