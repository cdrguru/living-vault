# Privacy posture

The Living Vault measures how your agentic assets are actually used by reading the
telemetry each agent harness already writes on your own machine. This document
states exactly what it reads, what it never reads, and where data lives.

## What it reads

Per-harness collectors read each tool's own local session logs:

| Harness | Local source (env override) |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` (`LIVING_VAULT_CLAUDE_DIR`) |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` (`LIVING_VAULT_CODEX_DIR`) |
| Grok | `~/.grok/sessions/<cwd>/<id>/` + `~/.grok/logs/unified.jsonl` (`LIVING_VAULT_GROK_DIR`, `LIVING_VAULT_GROK_UNIFIED`) |
| Copilot | `~/.copilot/session-state/<id>/events.jsonl` (`LIVING_VAULT_COPILOT_DIR`) |

## Metadata only, never content

The collectors read **only** structural metadata: event types, tool/skill/model
names, invocation and error counts, durations, token counts, ids, and timestamps.
They **never** read prompt text, model responses, reasoning, command text, tool
arguments, tool results, file contents, file paths, summaries, titles, or auth
tokens. This is enforced in the parser unit tests, which feed fixtures laced with
sentinel content and assert it never appears in the output
(`scripts/telemetry/{codex,grok,copilot}.test.mjs`).

The exact content-bearing fields excluded per harness were enumerated by probing
the real logs; see `docs/research/harness-probe/`. Notable exclusions:

- **Grok:** the whole `chat_history.jsonl`, `updates.jsonl`, `prompt_context.json`,
  `system_prompt.txt`, `rewind_points.jsonl`, `terminal/`, and the entire
  `~/.grok/worktrees/` checkout (it can contain secrets).
- **Copilot:** `events.jsonl` message `content`, `tool.execution_start.arguments`,
  `tool.execution_complete.result`, `toolTelemetry.*` properties, and the
  `session-store.db` text columns (`turns.user_message`, `turns.assistant_response`,
  `sessions.summary`). The collector does not open `session-store.db` at all, and
  never reads `~/.copilot/ide/*.lock`.
- **Codex:** `function_call_output` / exec output strings and any message payloads.

## Honesty over completeness

The UI labels what is and is not measured (`tracked` flags per metric:
`full | partial | occupancy | derived | none`). It refuses to fabricate figures.
For example, Copilot's `requests.cost` is an invariant premium-request quota flag
(always 1), not a dollar amount, so cost is shown as not tracked rather than as a
fake `$1`.

## Where data lives: real is local, demo is committed

Real usage never ships:

- The committed `src/data/imports/utilization.json` and `harness-usage.json` are
  **synthetic demos** (marked `"demo": true`).
- The collectors write your **real** usage to `src/data/imports/*.local.json`,
  which is **gitignored** (`src/data/imports/*.local.json`).
- The loaders (`telemetrySnapshot.ts`, `harnessUsage.ts`) prefer the `*.local.json`
  when present and fall back to the committed demo otherwise. So your local app
  shows real usage; a fresh checkout, CI, and any shipped bundle show only the demo.

Regenerate your local data any time:

```bash
node scripts/vault-telemetry.mjs        # Claude Code -> utilization.local.json
node scripts/vault-harness-usage.mjs    # all harnesses -> harness-usage.local.json
```

### Opt-in auto-feed (off by default)

Feeding the live Fabric Utilization table is manual by default: `npm run
telemetry:push` is the one command that does it. An optional auto-feed hook
(`scripts/telemetry-push-hook.mjs`, wired as a Claude Code Stop hook in
`.claude/settings.json`) can run that same command automatically at the end of
a session, but only when ALL of these hold:

- `LIVING_VAULT_AUTO_PUSH=1` is set in the environment (explicit opt-in),
- `RAYFIN_ACCESS_TOKEN` is set (no token, no feed),
- `rayfin/.env` exists from a prior `rayfin up`.

Otherwise it is a silent no-op, and it always exits 0 so it can never block a
session. What leaves the machine is unchanged by the hook: only the already
scrubbed, metadata-only Utilization rows the manual `telemetry:push` path
sends, never message, prompt, or command content.

### Codex billing exports

The Codex billing collector reads exported analytics files containing dates,
credit totals, token totals, usage types, and user identifiers. It redacts user
identifiers into stable local labels (`user_1`, `user_2`) and writes only
aggregate credits, tokens, and usage-type totals to
`src/data/imports/codex-billing.local.json`. The collector must not copy email
addresses, names, public ids, prompts, responses, commands, API keys, or access
tokens into app data.

## Agent worklist: source paths never leave the machine

`npm run vault:worklist` hands an agent the **absolute path** of each asset's real file so it
can edit the right thing instead of guessing. Those paths name you and the layout of your disk
(`/Users/<name>/.claude/skills/...`), so they are treated as the most sensitive artifact here:

- They are **never a field on the asset record.** The asset flows into the catalog projection,
  the Fabric tables, the public demo bundle, and the artifact a shared user uploads; a path on
  it would leak into all four. `scanClaudeAssets()` deliberately returns no path, and a separate
  `scanAssetSources()` supplies them to one consumer.
- They live only in gitignored local files: `asset-paths.local.json`, `worklist.local.json`, and
  `worklist.local.md` (`.gitignore` covers `*.local.json` and `*.local.md`).
- `scripts/guards/local-telemetry-guard.mjs` fingerprints every absolute path it finds in those
  files and **fails the public build** if any appears in `dist/`. It runs as part of `build:swa`.

Intervention records (`interventions.local.json`) are metadata only: an action, an outcome, a
date, an actor, and a short note. Never paste source content into a note.

## Before distributing

- The demo snapshots are safe to ship. The `*.local.json` files are not, and are
  gitignored.
- **History caveat:** earlier commits in this repo's history contain real owner
  aggregates (counts and token volumes, never content) from before this split.
  Before open-sourcing or sharing the repo, scrub history (for example
  `git filter-repo`) or publish from a fresh history. A public, multi-user build
  should also surface an explicit in-product consent and "stays local" notice
  before reading any user's logs.
