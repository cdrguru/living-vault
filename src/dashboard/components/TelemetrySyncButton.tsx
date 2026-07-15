import { useState } from 'react';

import { telemetrySnapshot } from '@/data';
import { useVault } from '@/dashboard/VaultContext';
import { Button } from '@/dashboard/components/Button';

type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'done'; applied: number; dropped: number }
  | { kind: 'error'; message: string };

/** Header action that imports the committed telemetry snapshot through the
 * DataSource seam, replacing synthetic utilization with real Claude Code usage. */
export function TelemetrySyncButton() {
  const { importTelemetry } = useVault();
  const [state, setState] = useState<SyncState>({ kind: 'idle' });

  async function handleSync() {
    setState({ kind: 'syncing' });
    try {
      const result = await importTelemetry(telemetrySnapshot.rows, telemetrySnapshot.meta);
      setState({ kind: 'done', applied: result.applied, dropped: result.dropped });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Sync failed' });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button disabled={state.kind === 'syncing'} onClick={() => void handleSync()} size="sm" variant="secondary">
        {state.kind === 'syncing' ? 'Loading...' : 'Sync telemetry'}
      </Button>
      {state.kind === 'done' && (
        <span className="text-xs text-muted" role="status">
          Applied {state.applied}, dropped {state.dropped}
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
