import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithVault } from '@/__tests__/harness';
import { seedDataset } from '@/data';
import { CoveragePage } from '@/dashboard/pages/CoveragePage';

/** A dataset with no pillar tags reads as unconfigured coverage. */
function withoutPillars() {
  const dataset = structuredClone(seedDataset);
  dataset.tags = dataset.tags.filter((tag) => tag.kind !== 'pillar');
  dataset.assetTags = dataset.assetTags.filter((row) => dataset.tags.some((tag) => tag.id === row.tagId));
  return dataset;
}

/** A dataset with one asset tagged with both a pillar and a capability, so the live matrix renders. */
function withPopulatedMatrix() {
  const dataset = structuredClone(seedDataset);
  const capability = dataset.tags.find((tag) => tag.kind === 'capability');
  if (!capability) throw new Error('seed has no capability tag');
  const pillar = { id: 'tag-test-pillar', tenantId: capability.tenantId, kind: 'pillar' as const, name: 'Engineering' };
  dataset.tags = [...dataset.tags, pillar];
  const asset = dataset.assets[0];
  dataset.assetTags = [
    ...dataset.assetTags,
    { assetId: asset.id, tagId: pillar.id },
    { assetId: asset.id, tagId: capability.id },
  ];
  return dataset;
}

describe('CoveragePage', () => {
  it('renders a guided setup with a Fabric sync action when coverage is not configured', async () => {
    renderWithVault(<CoveragePage />, withoutPillars());

    // The pillar explanation reads as onboarding, not a bare empty box.
    expect(await screen.findByText('What pillar tags are')).toBeInTheDocument();
    expect(screen.getByText('Next steps to populate coverage')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync from Fabric Library' })).toBeInTheDocument();
  });

  it('lists the three numbered populate steps with their state', async () => {
    renderWithVault(<CoveragePage />, withoutPillars());

    expect(await screen.findByText('Sync from the Fabric Library')).toBeInTheDocument();
    expect(screen.getByText('Sync telemetry')).toBeInTheDocument();
    expect(screen.getByText('Tag assets by pillar')).toBeInTheDocument();
    // State is conveyed as text, not color alone.
    expect(screen.getByText('Do this next')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting')).toHaveLength(2);
  });

  it('keeps duplicate clusters visible and links each asset to its detail page', async () => {
    const dataset = structuredClone(seedDataset);
    // Force two assets to share a content hash so a cluster exists.
    const [first, second] = dataset.assets;
    dataset.assets[1] = { ...second, contentHash: first.contentHash };

    renderWithVault(<CoveragePage />, dataset);

    // The cluster card stays visible and each member links to its asset detail page.
    const dupedLink = await screen.findByRole('link', {
      name: `Open ${dataset.assets[1].name} to resolve the duplicate`,
    });
    expect(dupedLink).toHaveAttribute('href', `/asset/${dataset.assets[1].id}`);
    expect(screen.getAllByText(/assets share a content hash/).length).toBeGreaterThan(0);
  });

  it('shows the live matrix when coverage data is present', async () => {
    renderWithVault(<CoveragePage />, withPopulatedMatrix());

    expect(await screen.findByText('Coverage matrix')).toBeInTheDocument();
    // The maturity legend only renders alongside the populated matrix.
    const legend = screen.getByText('color maps average maturity, the number is the asset count');
    expect(within(legend.closest('div') as HTMLElement).getByText('maturity')).toBeInTheDocument();
    // The guided setup is gone once real coverage exists.
    expect(screen.queryByText('Next steps to populate coverage')).not.toBeInTheDocument();
  });
});
