import { useRef, useState } from "react";

import { Button } from "@/dashboard/components/Button";
import { useVault } from "@/dashboard/VaultContext";
import {
  TelemetryUploadError,
  parseTelemetryUpload,
  reconcileTelemetryAssetIds,
} from "@/data/contribute/normalizeTelemetry";

const MAX_UPLOAD_MB = 10;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type UploadState =
  | { kind: "idle" }
  | { kind: "importing"; fileName: string }
  | {
      kind: "done";
      fileName: string;
      applied: number;
      dropped: number;
      unmatched: number;
      skipped?: string;
    }
  | { kind: "error"; message: string };

/**
 * Settings action that lets the owner upload a metadata-only telemetry export
 * (produced by the telemetry collector's emit-upload mode) into the live
 * Fabric backend, with no local collector running against the deploy. The file is
 * validated (normalizeTelemetry.ts), each row's assetId is reconciled onto the
 * deployed catalog by (type, slug), then importTelemetry runs the same coherence
 * contract + reload as the rest of the write path. Rows whose asset is not in the
 * deployed catalog are reported as unmatched (upload those assets first), not
 * dropped silently.
 */
export function TelemetryUpload() {
  const { importTelemetry, dataset } = useVault();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({
        kind: "error",
        message: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB); the maximum is ${MAX_UPLOAD_MB} MB.`,
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!dataset) {
      setState({ kind: "error", message: "Catalog is still loading; try again in a moment." });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setState({ kind: "importing", fileName: file.name });
    try {
      const upload = parseTelemetryUpload(await file.text());
      const reconciled = reconcileTelemetryAssetIds(upload.rows, dataset.assets);
      const result = await importTelemetry(reconciled.rows, upload.meta);
      setState({
        kind: "done",
        fileName: file.name,
        applied: result.applied,
        dropped: result.dropped,
        unmatched: reconciled.unmatchedKeys.length,
        skipped: result.skipped,
      });
    } catch (err) {
      const message =
        err instanceof TelemetryUploadError || err instanceof Error
          ? err.message
          : "Upload failed";
      setState({ kind: "error", message });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={state.kind === "importing"}
        onClick={() => inputRef.current?.click()}
        size="sm"
        variant="secondary"
      >
        {state.kind === "importing" ? "Importing..." : "Upload telemetry"}
      </Button>
      {state.kind === "done" && (
        <span className="text-xs text-muted" role="status">
          {state.skipped === "no-matching-rows"
            ? `${state.fileName}: no rows matched a catalogue asset. Upload those assets first (${state.unmatched} asset types missing).`
            : `${state.fileName}: applied ${state.applied}, dropped ${state.dropped}${
                state.unmatched > 0
                  ? ` (${state.unmatched} asset types not in the catalogue yet)`
                  : ""
              }`}
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-xs text-danger-fg" role="alert">
          {state.message.length > 300
            ? `${state.message.slice(0, 300)}…`
            : state.message}
        </span>
      )}
    </div>
  );
}
