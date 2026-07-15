import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LegendCard } from './LegendCard';

describe('LegendCard', () => {
  it('explains every relationship and card type with a label', () => {
    render(<LegendCard />);
    for (const label of [
      'One to many',
      'Optional lookup',
      'Many to many through a join table',
      'Join table',
      'Asset hub',
      'Tenant partition',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('draws line samples so solid and dashed edges read by pattern, not color alone', () => {
    const { container } = render(<LegendCard />);
    const lines = container.querySelectorAll('line');
    // Three edge rows, one with a dash array so the optional link is told apart.
    expect(lines).toHaveLength(3);
    const dashed = Array.from(lines).filter((line) =>
      line.getAttribute('stroke-dasharray')
    );
    expect(dashed).toHaveLength(1);
  });

  it('passes through an id so the trigger can label its popover', () => {
    const { container } = render(<LegendCard id="model-legend" />);
    expect(container.querySelector('#model-legend')).not.toBeNull();
  });
});
