import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders a polyline with one point per value', () => {
    const { container } = render(<Sparkline series={[1, 3, 2, 5]} label="trend" />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    const points = poly!.getAttribute('points')!.trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it('exposes an accessible label', () => {
    const { getByRole } = render(<Sparkline series={[1, 2]} label="42 invocations" />);
    expect(getByRole('img', { name: '42 invocations' })).toBeTruthy();
  });

  it('renders an empty state without a polyline for an empty series', () => {
    const { container } = render(<Sparkline series={[]} label="no telemetry" />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('applies a caller-supplied tone class so cards can color by status', () => {
    const { container } = render(<Sparkline className="text-danger" label="trend" series={[1, 2]} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-danger');
  });

  it('draws a filled area when fill is requested', () => {
    const { container } = render(<Sparkline fill label="trend" series={[1, 2, 3]} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
