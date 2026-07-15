# AGENTS.md

Guidance for AI coding agents (and humans in a hurry) working in this repo.

## What this is

The Living Vault: a local-first monitor for agentic assets. React 19 + Vite +
Tailwind UI over a Fabric-native data model defined with TypeScript entity
decorators in `rayfin/data/`. The app runs on deterministic seed data; real
usage arrives only through the local collector and browser upload.

## Run / test / verify

```bash
npm ci
npm run dev          # seed-data UI
npx tsc -b           # typecheck (app + rayfin subproject)
npm run lint
npm test             # public-scope Vitest suite (no external services)
npm run build:swa    # full static bundle: landing at /, demo at /demo
```

Close substantive changes with the verification commands actually run and
their output. If something cannot be verified here, say so plainly.

## Editing rules that are load-bearing

- Keep `src/data/types.ts` in 1:1 sync with `rayfin/data/*.ts`.
- Dashboard pages consume `useVault()`, metrics, formatters, and shared
  components only; never import a data source or seed directly in a page.
- Use TC39 decorators; do not enable `experimentalDecorators`.
- Bounded `@text({ max: N })` strings and explicit `@uuid()` foreign keys.
  An optional foreign key needs BOTH `@uuid({ optional: true })` AND
  `@one(() => X, { optional: true })`.
- Imports use the `@/` alias for `src/`.

## Privacy is a feature

Collectors record metadata only, never message or command content. Real
telemetry lives in gitignored `*.local.json` files; the committed JSONs
under `src/data/imports/` are synthetic demos. Do not weaken this split.
See docs/PRIVACY.md.

## Provenance

Most of `src/` is generated from a private upstream by an allowlist-based
export; README, docs, and templates are community-owned. See
CONTRIBUTING.md for how PRs against each kind are handled.
