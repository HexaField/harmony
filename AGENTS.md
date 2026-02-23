# AGENTS.md

## Project

Harmony — open-source, self-hostable Discord alternative with sovereign identity.

## Architecture

- Monorepo with pnpm workspaces
- TypeScript, ES modules throughout
- Vitest for testing, Rollup for builds
- All data stored as RDF quads
- W3C standards: DIDs, Verifiable Credentials, ZCAPs

## Commands

- `pnpm install` — install all dependencies
- `pnpm -r test` — run all tests
- `pnpm -r check` — type-check all packages
- `pnpm -r build` — build all packages

## Rules

- Always make sure `pnpm -r check` and `pnpm -r test` passes
- Tests are spec-oriented: reference W3C specs where applicable
- Interfaces first, implementations second
- Every module is standalone — no module knows about "Harmony the product"
- RDF quads are the universal interchange format
- Crypto must work in browser (no Node.js crypto dependency)

## Module Dependency Order (build bottom-up)

1. `@harmony/crypto` + `@harmony/quads` + `@harmony/vocab` (no internal deps)
2. `@harmony/did` (depends on crypto, quads)
3. `@harmony/vc` (depends on crypto, did, quads)
4. `@harmony/zcap` (depends on crypto, did, quads)
5. `@harmony/identity` (depends on crypto, did, vc, zcap, quads)
6. `@harmony/migration` (depends on crypto, did, vc, zcap, quads, identity)
7. `@harmony/migration-bot` (depends on migration, discord.js)
8. `@harmony/portal` (depends on identity, migration, express)
9. `@harmony/cli` (depends on everything)

## Implementation Reference

See `IMPLEMENTATION.md` for full module interfaces, spec tests, and architecture.
