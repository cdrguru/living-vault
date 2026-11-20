# The Living Vault — public docs bundle

Marketing and trust artifacts for audiences who **cannot** access the private application repository. Publish this folder as a public GitHub repo (suggested name: `the-living-vault-docs`) or co-host alongside the demo Static Web App.

## What is in the bundle

| File                   | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `index.html`           | Main landing page (pitch, live Fabric screenshots, CTAs)   |
| `ecosystem.html`       | Infographic + handoff table + stack proof quartet          |
| `telemetry-guide.html` | Public telemetry and privacy explainer with FAQ            |
| `PRIVACY.md`           | Sanitized privacy posture (link from trust conversations)  |
| `ARCHITECTURE.md`      | Sanitized architecture note (no secrets, no private paths) |
| `images/`              | Seed/demo screenshots referenced by older sections         |
| `images/fabricapp/`    | Live Fabric captures (2026-06-19); preferred for pitch     |

## Public CTAs (no private repo)

- **Try the demo:** `/demo` on the co-hosted SWA (for example `https://agreeable-glacier-0db060a0f.7.azurestaticapps.net/demo`)
- **Telemetry guide:** `telemetry-guide.html` (same origin)
- **Ecosystem map:** `ecosystem.html`
- **Source code:** [github.com/cdrguru/living-vault](https://github.com/cdrguru/living-vault) (the public showcase repo; still never link the private app repo)

## Audience guide

| Audience                    | Start here                            | Why                                       |
| --------------------------- | ------------------------------------- | ----------------------------------------- |
| Evaluator / prospect        | `index.html`                          | Full pitch, demo CTA, live Fabric proof   |
| Security / privacy reviewer | `telemetry-guide.html` + `PRIVACY.md` | Metadata-only posture without repo access |
| Architect / Fabric admin    | `ecosystem.html` + `ARCHITECTURE.md`  | Name disambiguation and stack handoffs    |
| Social / conference         | Stack quartet in `images/fabricapp/`  | SQL → Monitor → Overview → Power BI story |

## Refresh from the private app repo

From the Living Vault app root:

```bash
./docs/marketing/public-bundle/sync.sh
```

This copies HTML from `docs/marketing/`, rewrites paths for standalone hosting (`index.html`, `images/`), and syncs all images under `docs/images/` including `fabricapp/`.

Markdown files (`PRIVACY.md`, `ARCHITECTURE.md`, this README) are edited in the bundle directly. Re-copy manually if you maintain canonical copies elsewhere.

## Publish to a new public GitHub repo

```bash
cd docs/marketing/public-bundle
git init
git add .
git commit -m "docs: initial public Living Vault bundle"
gh repo create cdrguru/the-living-vault-docs --public --source=. --push
```

Or enable GitHub Pages on that repo and set the demo SWA or Pages URL in your LinkedIn / conference materials.

## Co-host on the demo SWA

`npm run build:swa` merges this bundle at `dist/` (landing at `/`) and builds the interactive app at `dist/demo/` (`/demo/*`). Deploy the whole `dist/` folder to the Azure Static Web App.

## Public-safe screenshots

Before external publish, **do not** use `living-vault-settings-fabric-connection-telemetry.png` without cropping step 2 (shows a local absolute path). All other `fabricapp/` captures from 2026-06-19 are public-safe as captured.
