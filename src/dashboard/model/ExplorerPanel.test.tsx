import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { seedDataset } from '@/data';

import { ExplorerPanel } from './ExplorerPanel';

function renderPanel(props: Partial<Parameters<typeof ExplorerPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ExplorerPanel
        dataset={seedDataset}
        onClose={() => undefined}
        onSelectRelationship={() => undefined}
        selection={{ kind: 'table', id: 'Asset' }}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('ExplorerPanel table view', () => {
  it('shows the table description, role, and live count', () => {
    renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Model explorer' });
    expect(within(panel).getByRole('heading', { name: 'Asset' })).toBeInTheDocument();
    expect(within(panel).getByText('Entity')).toBeInTheDocument();
    expect(
      within(panel).getByText(`${seedDataset.assets.length} rows`)
    ).toBeInTheDocument();
  });

  it('previews at most 8 rows and reports the remainder', () => {
    renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Model explorer' });
    const items = within(panel).getAllByRole('listitem');
    expect(items.length).toBeLessThanOrEqual(8 + 6);
    if (seedDataset.assets.length > 8) {
      expect(
        within(panel).getByText(`+ ${seedDataset.assets.length - 8} more`)
      ).toBeInTheDocument();
    }
  });

  it('closes via the close button', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when there is no selection', () => {
    renderPanel({ selection: null });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('ExplorerPanel relationship view', () => {
  it('shows the explanation and live link count', () => {
    renderPanel({ selection: { kind: 'relationship', id: 'asset-tag' } });
    const panel = screen.getByRole('complementary', { name: 'Model explorer' });
    expect(within(panel).getByText(/many to many through the AssetTag/)).toBeInTheDocument();
    expect(
      within(panel).getByText(`${seedDataset.assetTags.length} links`)
    ).toBeInTheDocument();
  });
});
