import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { coverageMatrix, duplicateClusters, fabricLibraryProjection } from '@/data';
import { useVault } from '@/dashboard/VaultContext';
import { formatNumber, formatPercent } from '@/dashboard/format';
import { CoverageGuide } from '@/dashboard/components/CoverageGuide';
import { EmptyState } from '@/dashboard/components/EmptyState';
import { Heatmap, type HeatmapCell } from '@/dashboard/components/Heatmap';
import { KpiCard } from '@/dashboard/components/KpiCard';
import { Panel } from '@/dashboard/components/Panel';
import { Pill } from '@/dashboard/components/Pill';
import { SectionCard } from '@/dashboard/components/SectionCard';
import { Skeleton, SkeletonKpiRow } from '@/dashboard/components/Skeleton';

function MaturityLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs text-subtle">
      <span className="eyebrow">maturity</span>
      <div className="flex items-center gap-1">
        <span>low</span>
        <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.12), rgb(var(--accent-rgb) / 0.58))' }} />
        <span>high</span>
      </div>
      <span className="text-subtle">color maps average maturity, the number is the asset count</span>
      <span className="text-subtle">an asset can sit in several cells, so cell counts can exceed the total asset count</span>
    </div>
  );
}

export function CoveragePage() {
  const { dataset, importProjection, loading } = useVault();
  const [syncing, setSyncing] = useState(false);

  if (loading || !dataset) {
    return (
      <div className="space-y-4">
        <SkeletonKpiRow />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const matrix = coverageMatrix(dataset);
  const duplicates = duplicateClusters(dataset);
  const populated = matrix.cells.filter((cell) => cell.count > 0);
  const totalCells = matrix.pillars.length * matrix.capabilities.length;
  const configured = totalCells > 0;
  const coverageRate = totalCells ? populated.length / totalCells : 0;
  const avgMaturity = populated.length
    ? populated.reduce((sum, cell) => sum + cell.maturity, 0) / populated.length
    : 0;

  // The guided setup takes over whenever the matrix cannot tell a coverage story
  // yet: no pillar or capability tags exist, or nothing is tagged with both. Once
  // a single intersection is populated, the live matrix renders instead.
  const needsSetup = !configured || populated.length === 0;

  const heatCells: HeatmapCell[] = matrix.cells.map((cell) => ({
    row: cell.pillar,
    col: cell.capability,
    count: cell.count,
    intensity: cell.maturity,
  }));

  const syncFabric = () => {
    setSyncing(true);
    void importProjection(fabricLibraryProjection).finally(() => setSyncing(false));
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-rise style={{ ['--rise-delay']: '0ms' } as CSSProperties}>
        <KpiCard
          detail={configured ? `${populated.length} of ${totalCells} intersections` : 'Sync pillar tags to start'}
          info="coverage.coverage"
          label="Coverage"
          tone={coverageRate >= 0.5 ? 'good' : coverageRate >= 0.25 ? 'warn' : 'neutral'}
          value={configured ? formatPercent(coverageRate) : 'Not configured'}
        />
        <KpiCard info="coverage.avgMaturity" label="Avg maturity" value={formatPercent(avgMaturity)} />
        <KpiCard detail={`${matrix.capabilities.length} capabilities`} info="coverage.pillars" label="Pillars" value={formatNumber(matrix.pillars.length)} />
        <KpiCard info="coverage.duplicateClusters" label="Duplicate clusters" tone={duplicates.length ? 'risk' : 'neutral'} value={formatNumber(duplicates.length)} />
      </section>

      {needsSetup ? (
        <div data-rise style={{ ['--rise-delay']: '80ms' } as CSSProperties}>
          <CoverageGuide onSyncFabric={syncFabric} syncing={syncing} />
        </div>
      ) : (
        <div data-rise style={{ ['--rise-delay']: '80ms' } as CSSProperties}>
          <Panel
            action={<span className="eyebrow">pillar x capability</span>}
            info="coverage.matrix"
            title="Coverage matrix"
          >
            <Heatmap
              cells={heatCells}
              cols={matrix.capabilities.map((capability) => capability.name)}
              rowHeader="pillar"
              rows={matrix.pillars.map((pillar) => pillar.name)}
            />
            <MaturityLegend />
          </Panel>
        </div>
      )}

      <div data-rise style={{ ['--rise-delay']: '160ms' } as CSSProperties}>
        <Panel
          action={<span className="eyebrow">{duplicates.length} found</span>}
          title="Duplicate clusters"
        >
          {duplicates.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {duplicates.map((cluster) => (
                <SectionCard key={cluster[0].contentHash} tone="warning">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-warning-fg">
                      {cluster.length} assets share a content hash
                    </div>
                    <code className="font-mono text-xs text-warning-fg/80">{cluster[0].contentHash.slice(0, 10)}</code>
                  </div>
                  <p className="mt-1 text-xs text-warning-fg/80">
                    Open each asset to compare and retire the duplicate.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {cluster.map((asset) => (
                      <li key={asset.id}>
                        <Link
                          aria-label={`Open ${asset.name} to resolve the duplicate`}
                          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
                          to={`/asset/${asset.id}`}
                        >
                          <Pill severity="warn" tone="amber">{asset.name}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))}
            </div>
          ) : (
            <EmptyState>No duplicate content hashes detected. Every asset body is unique.</EmptyState>
          )}
        </Panel>
      </div>
    </div>
  );
}
