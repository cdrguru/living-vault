import { Panel } from "@/dashboard/components/Panel";
import { Pill } from "@/dashboard/components/Pill";
import { CopyBlock } from "@/dashboard/components/CopyBlock";
import { CopyCommand } from "@/dashboard/components/CopyCommand";
import { TelemetrySyncButton } from "@/dashboard/components/TelemetrySyncButton";
import { FabricSyncButton } from "@/dashboard/components/FabricSyncButton";
import { ContributeUpload } from "@/dashboard/components/ContributeUpload";
import { TelemetryUpload } from "@/dashboard/components/TelemetryUpload";
import { TelemetryWizard } from "@/dashboard/components/TelemetryWizard";
import { useVault } from "@/dashboard/VaultContext";
import {
  datasetHasOnlyProbe,
  deriveEnvironment,
  readEnvInput,
  type EnvironmentField,
} from "@/dashboard/settings/environment";

// Public-build gate. The public export excludes the owner collectors
// (scripts/vault-telemetry.mjs, vault-harness-usage.mjs) and the MCP server
// (src/mcp/), so a public build must not advertise them. The standalone
// collector ships in the public repo and covers the same flow.
const isPublicBuild = import.meta.env.VITE_PUBLIC_BUILD === "true";

const COLLECTORS = isPublicBuild
  ? [
      {
        command: "node scripts/living-vault-collect.mjs assets",
        label: "Scan your ~/.claude assets to a projection JSON",
      },
      {
        command: "node scripts/living-vault-collect.mjs telemetry",
        label: "Aggregate your Claude Code usage to an upload JSON",
      },
    ]
  : [
      {
        command: "node scripts/vault-telemetry.mjs",
        label: "Claude Code usage to utilization.local.json",
      },
      {
        command: "node scripts/vault-harness-usage.mjs",
        label: "Per-harness usage to harness-usage.local.json",
      },
    ];

const MCP_CONFIG = `{
  "mcpServers": {
    "living-vault": {
      "command": "node",
      "args": ["--import", "tsx", "src/mcp/stdio.ts"]
    }
  }
}`;

const MCP_EXAMPLES = `top_assets({ metric: "effectiveness", filter: { type: "skill" }, limit: 5 })
top_assets({ metric: "cost_per_success", filter: { classification: "star" } })
get_asset({ slug: "skill:test-driven-development" })`;

function StatusRow({
  label,
  field,
}: {
  label: string;
  field: EnvironmentField;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <Pill severity={field.severity} tone={field.tone}>
        {field.value}
      </Pill>
    </div>
  );
}

/** Mode-aware status and setup guidance: where the data comes from, whether it is
 * live, and how to wire real usage. No runtime env switches, because the modes
 * are build-time gates and the collectors run from the CLI. */
export function ConnectionSection() {
  const { dataset } = useVault();
  const env = readEnvInput();
  const status = deriveEnvironment(env, dataset, datasetHasOnlyProbe(dataset));

  return (
    <section
      aria-labelledby="settings-connection"
      className="space-y-4"
      id="connection"
    >
      <div>
        <h2
          className="font-display text-lg font-semibold tracking-tight text-fg"
          id="settings-connection"
        >
          Connection &amp; data
        </h2>
        <p className="mt-1 text-sm text-muted">
          Where the Vault is reading from, and whether it is live.{" "}
          {status.modeLabel}.
        </p>
      </div>

      <Panel title="Status">
        <div className="space-y-0">
          <StatusRow field={status.dataSource} label="Data source" />
          <StatusRow field={status.auth} label="Auth" />
          <StatusRow field={status.telemetry} label="Telemetry" />
        </div>
      </Panel>

      {status.isDemo ? (
        <Panel title="What you are seeing">
          <p className="text-sm text-muted">
            This is a synthetic showcase. The catalog, usage, and cost figures
            are generated demo data, not a real library. On a local machine the
            same views run on your own Claude Code assets and usage, produced by
            the two collectors below.
          </p>
          <div className="mt-3 space-y-2">
            {COLLECTORS.map((c) => (
              <CopyCommand
                command={c.command}
                key={c.command}
                label={c.label}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ContributeUpload />
          </div>
          <p className="mt-2 text-xs text-subtle">
            Or upload a catalog export (a projection JSON, or a JSON array of
            assets) to merge it into this demo. It stays in your browser;
            nothing is uploaded anywhere.
          </p>
          <p className="mt-3 text-xs text-subtle">
            Collectors record metadata only, never message or command content.
          </p>
        </Panel>
      ) : status.isLocalDev ? (
        <Panel title="Wire your real data">
          <p className="text-sm text-muted">
            Run the collectors, then sync. They write gitignored
            <code className="mx-1 font-mono text-xs">*.local.json</code>
            files the dev server reads; the committed snapshots stay synthetic.
          </p>
          <div className="mt-3 space-y-2">
            {COLLECTORS.map((c) => (
              <CopyCommand
                command={c.command}
                key={c.command}
                label={c.label}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <FabricSyncButton />
            <TelemetrySyncButton />
            <ContributeUpload />
            <TelemetryUpload />
          </div>
          <p className="mt-3 text-xs text-subtle">
            Collectors record metadata only, never message or command content.
            Deploy ships the demo build (npm run build:swa); a live Fabric
            deploy is separate and gated.
          </p>
        </Panel>
      ) : (
        <TelemetryWizard />
      )}

      {!isPublicBuild && (
        <Panel title="Connect an agent (MCP)">
          <p className="text-sm text-muted">
            Run the Vault locally and it exposes a read-only Model Context
            Protocol server, so any MCP client (Claude Code, Cursor, and others)
            can rank your assets by metric and filter. Tools:{" "}
            <code className="font-mono text-xs text-fg">top_assets</code>,{" "}
            <code className="font-mono text-xs text-fg">get_asset</code>,{" "}
            <code className="font-mono text-xs text-fg">list_metrics</code>,{" "}
            <code className="font-mono text-xs text-fg">list_filters</code>.
          </p>
          <div className="mt-3 space-y-2">
            <CopyBlock code={MCP_CONFIG} label="Add to .mcp.json (stdio)" />
            <CopyCommand command="npm run mcp" label="Run the MCP over stdio" />
            <CopyCommand
              command="npm run mcp:http"
              label="Run the MCP over HTTP (127.0.0.1:7331)"
            />
            <CopyBlock code={MCP_EXAMPLES} label="Example top_assets queries" />
          </div>
          <p className="mt-3 text-xs text-subtle">
            Read-only over your local seed and overlays. The HTTP server binds
            127.0.0.1 and refuses a non-loopback bind unless
            VAULT_MCP_ALLOW_PUBLIC is set, since it is unauthenticated.
          </p>
        </Panel>
      )}
    </section>
  );
}
