# The Living Vault — public architecture note

Sanitized overview for the public docs bundle. No secrets, no private repo paths required to understand the product.

## What it is

The Living Vault is a Microsoft Fabric app built with the Rayfin SDK. It is an editable system of record and effectiveness monitor for agentic assets: skills, subagents, prompts, MCP servers, hooks, commands, and workflows.

The product answers operational questions at a glance: what exists, what is governed, what is used, what is effective, what is stale or duplicated, what depends on what, and what needs action.

## Ecosystem (keep names distinct)

| System | Role |
| --- | --- |
| **The Library** | Distribution catalog. Installs assets across harnesses. |
| **the-catalog-source** | Upstream catalog projection source for the Vault asset catalog. |
| **The Living Vault** | Fabric app: govern, measure, improve. |
| **the-vault** | Cousin personal skill library. Tooling source only; not the Vault data backbone. |

There is no continuous automatic sync between all four. Each handoff is intentional. See `ecosystem.html` for the handoff table.

## Stack

- **UI:** React 19, Vite, TypeScript, Tailwind
- **Platform:** Rayfin SDK on Microsoft Fabric
- **Model:** Nine Rayfin entities (see below)
- **Data access:** GraphQL over MSSQL

### Nine Rayfin entities

| Entity | Role |
| --- | --- |
| **Asset** | Governed catalog row (skill, subagent, MCP, etc.) |
| **Owner** | Optional owner attribution |
| **Origin** | Optional upstream source |
| **Tag** | Taxonomy label |
| **Bundle** | Named asset grouping |
| **AssetTag** | Asset ↔ Tag join |
| **AssetBundle** | Asset ↔ Bundle join |
| **AssetDependency** | Requires / required-by edges |
| **Utilization** | Daily effectiveness facts (invocations, tokens, cost estimates) |

## Two runtime paths

| Path | Purpose |
| --- | --- |
| **Demo Static Web App** | Zero Fabric cost. Synthetic seed data and demo auth. Public URL for evaluators. |
| **Live Fabric deploy** | Rayfin semantic model + Fabric SSO. Read/write on the same nine entities. Deployed and exercised (2026-06-19). |

## Telemetry (conceptual)

1. Each harness writes local session logs on the practitioner's machine.
2. Optional collectors read metadata only (never prompt or response content).
3. Real usage lands in gitignored local snapshots; demo builds ship synthetic JSON only.
4. The Monitor and Effectiveness surfaces render usage with per-harness honesty grades.

See `PRIVACY.md` and `telemetry-guide.html` in this bundle for the public privacy posture.

## Governance inside Fabric

- Editable catalog with add, edit, retire
- **Submission review queue:** contributors upload a scanned projection JSON; pending items live outside `VaultDataset` until a maintainer accepts at `/submissions`
- **importProjection** on accept: same idempotent upsert path as admin catalog sync
- **runDataSourceContract** on every write: referential integrity before persistence
- Per-metric fidelity grades (`full`, `partial`, `occupancy`, `derived`, `none`)
- Tenant RBAC and org-wide rollups: gated Fabric work (app-side review guard today)

## Power BI relationship

The Rayfin semantic model is Fabric-native and Power BI-ready. The Living Vault's Monitor and `/model` canvas are the live operational UI. Power BI is an optional downstream analytics consumer, not the product substitute. Live captures in `images/fabricapp/` show the same overview narrative in both surfaces.

## Status

- Interactive demo: public SWA (synthetic data)
- Live Fabric deploy: exercised on Rayfin + MSSQL (2026-06-19)
- Source repository: private today; **public repo coming soon**
- Public docs bundle: this folder, publishable as `the-living-vault-docs`