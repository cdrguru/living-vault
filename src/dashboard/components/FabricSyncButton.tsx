import { useState } from 'react';

import { fabricLibraryProjection } from '@/data';
import { useVault } from '@/dashboard/VaultContext';
import { Button } from '@/dashboard/components/Button';
import { fabricSyncLabels } from '@/dashboard/components/fabricSyncCopy';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'done'; added: number; updated: number }
  | { kind: 'error'; message: string };

/**
 * Header action that merges the committed fabric-library projection into the vault
 * through the DataSource seam. One click runs the upsert, the coherence contract,
 * and a dataset reload, then reports how many assets were added or updated.
 */
export function FabricSyncButton() {
  const { importProjection } = useVault();
  const [state, setState] = useState<SyncState>({ kind: 'idle' });
  const { idleLabel, idleShort } = fabricSyncLabels(
    import.meta.env.VITE_DEMO_MODE === 'true',
  );

  async function handleSync() {
    setState({ kind: 'syncing' });
    try {
      const result = await importProjection(fabricLibraryProjection);
      setState({ kind: 'done', added: result.added, updated: result.updated });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Sync failed' });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={state.kind === 'syncing'}
        onClick={() => void handleSync()}
        size="sm"
        variant="primary"
      >
        <span className="hidden sm:inline">
          {state.kind === 'syncing' ? 'Syncing...' : idleLabel}
        </span>
        <span className="sm:hidden">{state.kind === 'syncing' ? 'Syncing' : idleShort}</span>
      </Button>
      {state.kind === 'done' && (
        <span className="text-xs text-muted" role="status">
          Added {state.added}, updated {state.updated}
        </span>
      )}
      {state.kind === 'error' && (
        <span className="text-xs text-danger-fg" role="alert">
          {state.message}
        </span>
      )}
    </div>
  );
}
