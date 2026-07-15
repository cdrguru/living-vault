import { useId, useRef, useState } from "react";

import { Button } from "@/dashboard/components/Button";
import { useActor } from "@/dashboard/useActor";
import { useVault } from "@/dashboard/VaultContext";
import {
  ContributionError,
  parseContribution,
} from "@/data/contribute/normalize";

const MAX_UPLOAD_MB = 5;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type UploadMode = "merge" | "submit";

type UploadState =
  | { kind: "idle" }
  | { kind: "importing"; fileName: string }
  | { kind: "done"; added: number; updated: number; fileName: string }
  | { kind: "submitted"; itemCount: number; fileName: string }
  | { kind: "error"; message: string };

/**
 * Settings action that lets a contributor upload their catalog (a projection JSON,
 * or a bare array of assets) through the DataSource seam, with no local collector.
 * The file is normalized to a contract-clean ProjectionInput (normalize.ts), then
 * either merged directly (importProjection: the same upsert + coherence contract +
 * reload the Fabric Library sync uses) or staged for review (submitProjection),
 * depending on the chosen mode. Review staging never touches the live catalog.
 */
export function ContributeUpload() {
  const { importProjection, submitProjection } = useVault();
  const { ownerId } = useActor();
  const inputRef = useRef<HTMLInputElement>(null);
  const modeName = useId();
  const [mode, setMode] = useState<UploadMode>("merge");
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
    setState({ kind: "importing", fileName: file.name });
    try {
      const projection = parseContribution(await file.text());
      if (mode === "submit") {
        const submission = await submitProjection(projection, {
          submittedByOwnerId: ownerId,
        });
        setState({
          kind: "submitted",
          itemCount: submission.itemCount,
          fileName: file.name,
        });
      } else {
        const result = await importProjection(projection);
        setState({
          kind: "done",
          added: result.added,
          updated: result.updated,
          fileName: file.name,
        });
      }
    } catch (err) {
      const message =
        err instanceof ContributionError || err instanceof Error
          ? err.message
          : "Upload failed";
      setState({ kind: "error", message });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <fieldset className="flex items-center gap-3 text-xs text-muted">
        <legend className="sr-only">Upload mode</legend>
        <label className="flex items-center gap-1.5">
          <input
            checked={mode === "merge"}
            name={modeName}
            onChange={() => setMode("merge")}
            type="radio"
          />
          Merge now
        </label>
        <label className="flex items-center gap-1.5">
          <input
            checked={mode === "submit"}
            name={modeName}
            onChange={() => setMode("submit")}
            type="radio"
          />
          Submit for review
        </label>
      </fieldset>
      <div className="flex items-center gap-2">
        <input
          accept="application/json,.json"
          aria-label="Upload contribution file"
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
          {state.kind === "importing"
            ? "Uploading..."
            : mode === "submit"
              ? "Upload for review"
              : "Upload contribution"}
        </Button>
        {state.kind === "done" && (
          <span className="text-xs text-muted" role="status">
            {state.fileName}: added {state.added}, updated {state.updated}
          </span>
        )}
        {state.kind === "submitted" && (
          <span className="text-xs text-muted" role="status">
            {state.fileName}: {state.itemCount} item(s) submitted for review
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
    </div>
  );
}
