# Fabric app screenshots

Live captures from the deployed **The Living Vault** Rayfin Fabric app and its downstream Fabric SQL and Power BI surfaces. Use this index when picking images for marketing, in-app help, README updates, or UI/UX review.

## Capture provenance

| Field | Value |
| --- | --- |
| **Captured** | Friday, **2026-06-19**, ~**9:00 PM** (local) |
| **Environment** | Live Fabric deploy (not the zero-cost SWA demo seed) |
| **Count** | 13 PNG files in this folder |
| **Prior names** | `screenshots_1.png` through `screenshots_13.png` (renamed 2026-06-19) |

All files in this folder share the same capture session unless noted otherwise.

## Stack story quartet (start here for marketing)

These four screenshots tell the end-to-end story in one slide deck or landing-page row:

| # | File | Layer | One-line story |
| --- | --- | --- | --- |
| 1 | `fabric-sql-the-vault-utilizations-table.png` | **Fabric SQL** | Telemetry lands in the `Utilizations` table (755 rows, Claude model metadata). |
| 2 | `living-vault-monitor-harness-health-graph.png` | **Product (north star)** | Cross-harness Monitor: usage cards, health strip, exception queue, asset topology graph. |
| 3 | `living-vault-overview-health-quadrant.png` | **Executive overview** | Governed × Effective quadrant, live activity KPIs, "what to fix next" triage list. |
| 4 | `power-bi-living-vault-overview-dashboard.png` | **Power BI (downstream)** | Same overview narrative in a Power BI report bound to the Fabric semantic model. |

Use this quartet in [`ecosystem.html`](../../ecosystem.html), conference decks, and LinkedIn carousels. Pair with copy that separates **The Library** (distribution), **the-catalog-source** (catalog projection), **The Living Vault** (ops UI), and **Power BI** (optional analytics consumer).

## Full catalog

| File | Surface | What it shows |
| --- | --- | --- |
| `fabric-sql-the-vault-utilizations-table.png` | Fabric SQL | `the-vault` database, **Utilizations** table preview (~755 rows). Columns: invocations, successes, errors, latency, tokens, cost, model id. Proves the live data layer behind effectiveness metrics. |
| `living-vault-overview-guided-tour-navigation.png` | Overview + tour | Guided tour step **"Navigate the Vault"** over the left nav (8 primary views + Settings). Good for onboarding and first-run help. |
| `living-vault-settings-fabric-connection-telemetry.png` | Settings | Connection status (Rayfin live, Fabric SSO), three-step **live telemetry setup** wizard, theme and filter preferences. |
| `living-vault-submissions-review-queue.png` | Submissions | Team review queue: pending submission, per-item accept flow ("Deploy Smoke Skill", status `accepted`). |
| `living-vault-data-model-asset-relationships.png` | Model (`/model`) | ERD canvas with **Asset** hub, join tables, **Utilization** facts, health overlay on relationships. Explorer panel open on Asset. |
| `living-vault-dependencies-bundle-composition.png` | Dependencies | Requires / required-by graph and bundle membership for governed assets. |
| `living-vault-coverage-matrix-duplicate-clusters.png` | Coverage | Pillar, domain, capability coverage plus duplicate-cluster analysis. |
| `living-vault-cost-model-efficiency.png` | Cost | Per-asset and per-model cost estimates from harness token usage (labeled estimated, not metered). |
| `living-vault-effectiveness-dark-mode-ranking.png` | Effectiveness | Dark theme: model breakdown bars, ranked asset table with sparklines, quadrant filters. |
| `living-vault-catalog-asset-list.png` | Catalogue | Editable asset table: type, tier, risk, utilization bar, status, Edit/Retire actions. |
| `living-vault-monitor-harness-health-graph.png` | Monitor | **North star surface:** harness summary strip (Claude, Codex, Grok, Copilot), health metrics, exception queue, topology graph. |
| `living-vault-overview-health-quadrant.png` | Overview | Executive dashboard: live activity, quadrant bubble chart, library composition, stale count. |
| `power-bi-living-vault-overview-dashboard.png` | Power BI | Overview report mirroring the Vault executive view (quadrant, KPIs, fix-next list). |

## Where to use each screenshot

### Marketing and pitch (`docs/marketing/`)

| Best picks | Why |
| --- | --- |
| Stack story quartet (above) | Shows Fabric-native depth without opening the private repo. |
| `living-vault-monitor-harness-health-graph.png` | Differentiator: cross-harness ops monitor, not trace observability. |
| `living-vault-submissions-review-queue.png` | Team governance story (submit → review → accept). |
| `living-vault-effectiveness-dark-mode-ranking.png` | Polished dark-mode hero for social crops. |

Avoid in public crops without redaction:

- `living-vault-settings-fabric-connection-telemetry.png` Step 2 shows a **local absolute path** and collector command. Crop or replace before external publish.

### In-app help and onboarding

| Best picks | Why |
| --- | --- |
| `living-vault-overview-guided-tour-navigation.png` | Matches the product tour; documents nav affordance. |
| `living-vault-settings-fabric-connection-telemetry.png` | Settings telemetry wizard (sanitize path for public docs). |
| `living-vault-catalog-asset-list.png` | Explains Catalogue columns and Edit/Retire workflow. |
| `living-vault-data-model-asset-relationships.png` | Helps users understand Asset as the model hub. |

### UI / UX improvement notes

Use this set as a **baseline snapshot** (2026-06-19 21:00). When reviewing regressions or polish, compare against these files.

| File | UX signals worth tracking |
| --- | --- |
| `living-vault-overview-health-quadrant.png` | Banner says "No telemetry imported yet" while KPIs show 6,988 invocations. Align empty-state copy with loaded data. |
| `living-vault-monitor-harness-health-graph.png` | Same banner inconsistency; exception queue density vs graph legibility at 125% zoom. |
| `living-vault-overview-guided-tour-navigation.png` | Tour is step 1/1 only in this capture. Verify multi-step tour ships or adjust copy. |
| `living-vault-catalog-asset-list.png` | Many rows show **Risks** badge; validate color semantics vs Coverage page. |
| `living-vault-effectiveness-dark-mode-ranking.png` | 78 assets with "No telemetry" vs 14 effective. Honesty grade story is working; check filter discoverability. |
| `power-bi-living-vault-overview-dashboard.png` | Quadrant labels differ slightly from the React app (e.g. Shelfware vs Overflows naming). Keep Power BI and app vocabulary in sync. |

### Ecosystem and architecture docs

| Best picks | Pair with |
| --- | --- |
| `fabric-sql-the-vault-utilizations-table.png` | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) telemetry section |
| `living-vault-data-model-asset-relationships.png` | Nine-entity Rayfin model description |
| `power-bi-living-vault-overview-dashboard.png` | [`ecosystem.html`](../../ecosystem.html) Power BI branch |
| `living-vault-settings-fabric-connection-telemetry.png` | [`telemetry-guide.html`](../../telemetry-guide.html) |

## Suggested placements

| Destination | Recommended files |
| --- | --- |
| Root `README.md` Screenshots table | Replace or supplement seed/SWA shots with `living-vault-monitor-harness-health-graph.png` + `living-vault-overview-health-quadrant.png` for live Fabric proof. |
| `docs/marketing/living-vault.html` north-star section | `living-vault-monitor-harness-health-graph.png`, `living-vault-data-model-asset-relationships.png` |
| `docs/marketing/ecosystem.html` | Stack story quartet as inline figures |
| `docs/marketing/public-bundle/` | Run `sync.sh`, then copy desired `fabricapp/*.png` into `public-bundle/images/` manually until sync includes this folder |
| LinkedIn / conference | Monitor + Effectiveness dark + Power BI quadrant |

## File naming convention

```
{platform}-{product}-{surface}-{detail}.png
```

Examples:

- `fabric-sql-…` — Microsoft Fabric SQL endpoint, not the Rayfin React shell
- `living-vault-…` — The Living Vault Fabric-hosted app UI
- `power-bi-…` — Power BI report consuming the semantic model

## Related paths

- Older seed/demo captures: [`../`](../) (`home.png`, `model-canvas-*.png`, etc.)
- Marketing pages: [`../../`](../../) (the bundle root: ecosystem, telemetry guide, architecture)
- Privacy posture: [`../../PRIVACY.md`](../../PRIVACY.md)

## Refresh checklist

When re-capturing after a UI change:

1. Keep the same filename if the surface is unchanged (overwrite PNG).
2. Update the **Capture provenance** table at the top of this README with the new date/time.
3. Re-check UX notes above for banner copy, label parity with Power BI, and public-safe crops.
4. Run `./docs/marketing/public-bundle/sync.sh` if publishing the public docs bundle.