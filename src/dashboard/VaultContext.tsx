/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createDataSource,
  type AssetInput,
  type AssetRow,
  type DataSource,
  type HarnessUsage,
  type ImportResult,
  type ProjectionInput,
  type SubmissionRow,
  type TelemetryMeta,
  type UnattributedUsage,
  type UtilizationRow,
  type VaultDataset,
} from "@/data";
import type {
  SubmissionDetail,
  SubmissionFilter,
  SubmissionItemDecisionInput,
  SubmissionMeta,
  SubmissionReview,
  SubmissionTransitionStatus,
  TelemetryResult,
} from "@/data/DataSource";
import { harnessDateBounds } from "@/data/harnessUsage";
import type { DateWindow } from "@/data/metrics";
import { applyFilters, type VaultFilters } from "@/dashboard/filters";
import {
  dataBounds,
  resolveTimeRange,
  unionBounds,
  type TimeRangePreset,
} from "@/dashboard/timeRange";
import {
  getDefaultFilters,
  getDefaultRange,
} from "@/dashboard/settings/preferences";

interface VaultContextValue {
  dataset: VaultDataset | null;
  loading: boolean;
  error: string | null;
  filters: VaultFilters;
  setFilters: (filters: VaultFilters) => void;
  filteredAssets: AssetRow[];
  addAsset: (input: AssetInput) => Promise<AssetRow>;
  updateAsset: (id: string, patch: Partial<AssetInput>) => Promise<AssetRow>;
  retireAsset: (id: string) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  importProjection: (incoming: ProjectionInput) => Promise<ImportResult>;
  importTelemetry: (
    rows: UtilizationRow[],
    meta: TelemetryMeta,
  ) => Promise<TelemetryResult>;
  /** Real Claude Code usage keys that did not resolve to a governed asset, ranked highest first. */
  getUnattributedUsage: () => UnattributedUsage[];
  /** Per-harness usage summaries (Claude Code, Codex, ...) from each harness's own local logs. */
  getHarnessUsage: () => HarnessUsage[];
  /** Stage a normalized contribution as a pending submission for review. */
  submitProjection: (
    incoming: ProjectionInput,
    meta: SubmissionMeta,
  ) => Promise<SubmissionRow>;
  /** List staged submissions, newest first, optionally filtered by status. */
  listSubmissions: (filter?: SubmissionFilter) => Promise<SubmissionRow[]>;
  /** A single submission with its staged items. */
  getSubmission: (id: string) => Promise<SubmissionDetail>;
  /** Record per-item decisions; accepted items route through importProjection. */
  decideSubmission: (
    id: string,
    decisions: SubmissionItemDecisionInput[],
    review: SubmissionReview,
  ) => Promise<ImportResult>;
  /** Move a submission to under_review or changes_requested. */
  transitionSubmission: (
    id: string,
    status: SubmissionTransitionStatus,
  ) => Promise<SubmissionRow>;
  /** The global dashboard time window (null = all history), and how to change it. */
  timeRange: DateWindow | null;
  timeRangePreset: TimeRangePreset;
  /** The dataset's telemetry date bounds, for a custom range picker. */
  timeRangeBounds: DateWindow | null;
  setTimeRangePreset: (preset: TimeRangePreset) => void;
  setCustomTimeRange: (window: DateWindow) => void;
  reload: () => Promise<void>;
  /** Discard local edits and reload the pristine seed (seed source only). */
  resetToSeed: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

export function VaultProvider({
  children,
  dataSource,
}: {
  children: ReactNode;
  dataSource?: DataSource;
}) {
  const source = useMemo(() => dataSource ?? createDataSource(), [dataSource]);
  const [dataset, setDataset] = useState<VaultDataset | null>(null);
  const [filters, setFilters] = useState<VaultFilters>(() =>
    getDefaultFilters(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>(() =>
    getDefaultRange(),
  );
  const [customWindow, setCustomWindow] = useState<DateWindow | null>(null);

  const setCustomTimeRange = useCallback((window: DateWindow) => {
    setCustomWindow(window);
    setTimeRangePreset("custom");
  }, []);

  const harnessBounds = useMemo(() => harnessDateBounds(), []);
  const timeRangeBounds = useMemo(
    () => unionBounds(dataBounds(dataset), harnessBounds),
    [dataset, harnessBounds],
  );
  const timeRange = useMemo(
    () => resolveTimeRange(timeRangeBounds, timeRangePreset, customWindow),
    [customWindow, timeRangeBounds, timeRangePreset],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDataset(await source.getDataset());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vault data",
      );
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshAfter = useCallback(
    async <T,>(operation: Promise<T>) => {
      const result = await operation;
      setDataset(await source.getDataset());
      return result;
    },
    [source],
  );

  const resetToSeed = useCallback(async () => {
    await source.reset();
    await reload();
  }, [source, reload]);

  const value = useMemo<VaultContextValue>(
    () => ({
      dataset,
      loading,
      error,
      filters,
      setFilters,
      filteredAssets: dataset ? applyFilters(dataset, filters) : [],
      addAsset: (input) => refreshAfter(source.addAsset(input)),
      updateAsset: (id, patch) => refreshAfter(source.updateAsset(id, patch)),
      retireAsset: (id) => refreshAfter(source.retireAsset(id)),
      deleteAsset: (id) => refreshAfter(source.deleteAsset(id)),
      importProjection: (incoming) =>
        refreshAfter(source.importProjection(incoming)),
      importTelemetry: (rows, meta) =>
        refreshAfter(source.importTelemetry(rows, meta)),
      getUnattributedUsage: () => source.getUnattributedUsage(),
      getHarnessUsage: () => source.getHarnessUsage(timeRange ?? undefined),
      submitProjection: (incoming, meta) =>
        source.submitProjection(incoming, meta),
      listSubmissions: (filter) => source.listSubmissions(filter),
      getSubmission: (id) => source.getSubmission(id),
      // Accept can mutate the catalog via importProjection, so reload after.
      decideSubmission: (id, decisions, reviewMeta) =>
        refreshAfter(source.decideSubmission(id, decisions, reviewMeta)),
      transitionSubmission: (id, status) =>
        source.transitionSubmission(id, status),
      timeRange,
      timeRangePreset,
      timeRangeBounds,
      setTimeRangePreset,
      setCustomTimeRange,
      reload,
      resetToSeed,
    }),
    [
      dataset,
      error,
      filters,
      loading,
      refreshAfter,
      reload,
      resetToSeed,
      setCustomTimeRange,
      source,
      timeRange,
      timeRangeBounds,
      timeRangePreset,
    ],
  );

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used within VaultProvider");
  return context;
}
