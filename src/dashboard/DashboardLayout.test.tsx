import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderInDashboard } from '@/__tests__/harness';

function PageStub() {
  return <div>Dashboard content</div>;
}

describe('DashboardLayout', () => {
  it('keeps secondary filters behind a mobile filter drawer affordance', async () => {
    renderInDashboard(<PageStub />);

    const button = await screen.findByRole('button', { name: 'Filters' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: 'Filter by type' }).length).toBeGreaterThan(0);
  });

  it('hides the asset search and filters on the model canvas route', async () => {
    renderInDashboard(<PageStub />, '/model');

    expect(
      screen.queryByRole('searchbox', { name: 'Search assets' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Filter by type' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the asset search on catalog-style routes', async () => {
    renderInDashboard(<PageStub />, '/catalogue');

    expect(
      await screen.findByRole('searchbox', { name: 'Search assets' }),
    ).toBeInTheDocument();
  });

  it('hides the global time range on settings and submissions', async () => {
    renderInDashboard(<PageStub />, '/settings');
    expect(screen.queryByRole('radiogroup', { name: 'Time range' })).not.toBeInTheDocument();

    renderInDashboard(<PageStub />, '/submissions');
    expect(screen.queryByRole('radiogroup', { name: 'Time range' })).not.toBeInTheDocument();
  });

  it('shows the asset name as the page title on asset detail routes', async () => {
    renderInDashboard(<PageStub />, '/asset/as-11');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'qa-tester' }),
    ).toBeInTheDocument();
  });
});
