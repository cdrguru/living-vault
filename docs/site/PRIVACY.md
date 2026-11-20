# Privacy posture (public summary)

The Living Vault measures how agentic assets are used by reading structural metadata from each AI coding harness's local session logs on your machine. This document states what is read, what is never read, and where data lives. No repository access is required to understand this posture.

For the full public explainer with FAQ, open `telemetry-guide.html` in this bundle.

## Metadata only, never content

Collectors read **only** structural metadata: event types, tool and skill names, invocation and error counts, durations, token counts, ids, and timestamps.

They **never** read prompt text, model responses, reasoning, command text, tool arguments, tool results, file contents, file paths, summaries, titles, or auth tokens.

Parser unit tests feed fixtures laced with sentinel content and assert it never appears in collector output.

## Per-harness sources (typical)

| Harness     | What is read (metadata paths)    | Typical grade            |
| ----------- | -------------------------------- | ------------------------ |
| Claude Code | Project transcript JSONL files   | `full`                   |
| Codex       | Session rollout JSONL files      | `partial`                |
| Grok        | Session metadata and unified log | `partial`                |
| Copilot     | Session event JSONL streams      | `occupancy` or `derived` |

### Notable exclusions

- **Grok:** chat history, prompt context, system prompts, terminal output, and worktree checkouts (can contain secrets).
- **Copilot:** message content, tool arguments and results, SQLite session-store text columns. The collector does not open the SQLite store.
- **Codex:** function output strings and message payloads.
- **Claude Code:** transcript message bodies; only structural invocation metadata is parsed.

## Where data lives

| Build           | Telemetry data                                                                          |
| --------------- | --------------------------------------------------------------------------------------- |
| **Public demo** | Committed synthetic `utilization.json` and `harness-usage.json` only                    |
| **Self-host**   | Real usage in gitignored `*.local.json` on your disk; never bundled into shipped builds |

The public demo cannot access your machine. Self-host collectors run only when you execute them locally (source: [github.com/cdrguru/living-vault](https://github.com/cdrguru/living-vault)).

### Collector entrypoints (self-host)

```bash
node scripts/vault-telemetry.mjs        # Claude Code -> utilization.local.json
node scripts/vault-harness-usage.mjs    # all harnesses -> harness-usage.local.json
```

The dev app prefers `*.local.json` when present. Demo and CI builds never include those files.

## Honesty grades

Each harness metric carries a fidelity label:

| Grade       | Meaning                                |
| ----------- | -------------------------------------- |
| `full`      | Directly instrumented end to end       |
| `partial`   | Measured where logs allow; gaps marked |
| `occupancy` | Presence and activity only             |
| `derived`   | Inferred from adjacent signals         |
| `none`      | Not measurable; shown as a gap         |

The product does not fabricate figures. Assets with no matching telemetry show "no telemetry", not a measured zero. Copilot cost is shown as untracked when dollar amounts are not available in logs.

## Demo vs org-wide (honest ceiling)

Local-first protects privacy and caps reach today. Org-wide rollups require a Fabric ingestion design because harness logs originate on practitioner machines, not inside Fabric. The product names that tension rather than hiding it.
