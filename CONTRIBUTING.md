# Contributing to The Living Vault

Thanks for your interest. This page is the practical contract.

## Ground rules

- Be kind. The [Code of Conduct](CODE_OF_CONDUCT.md) applies everywhere.
- Open an issue before large changes so we can agree on direction.
- Privacy is a feature: collectors are metadata-only, and nothing a user
  measures ever leaves their machine by default. PRs that weaken this are
  declined.

## Dev loop

```bash
npm ci
npm run dev        # seed-data UI
npm run lint
npm test           # must be green before a PR
npm run build:swa  # full bundle check
```

## What is generated vs community-owned

This repo is a curated export of a private upstream:

- Most of `src/`, `rayfin/`, and `scripts/` is GENERATED: it is refreshed by
  the export tooling, and direct PRs against it are reviewed upstream and
  cherry-picked back, so your change may land in a later export rather than
  by merge. Still very welcome.
- README, docs, templates, and workflow files are COMMUNITY-OWNED: PRs merge
  directly here.

`.public-export/state.json` records which paths are which.

## Code style

- TypeScript strict; TC39 decorators (do not enable experimentalDecorators).
- Imports use the `@/` alias for `src/`.
- UI pages consume the data layer through `useVault()` and the metrics
  helpers, never a data source directly.
- Bounded `@text({ max: N })` strings and explicit `@uuid()` foreign keys in
  `rayfin/data/` entities; keep `src/data/types.ts` in 1:1 sync.

## Reporting bugs and requesting features

Use the issue templates. For anything security-sensitive, see
[SECURITY.md](SECURITY.md) instead of a public issue.
