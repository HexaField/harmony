# Harmony

Open-source, self-hostable Discord alternative with sovereign identity.

Built on W3C standards: DIDs, Verifiable Credentials, ZCAPs, and RDF linked data.

Licensed under the [Cryptographic Autonomy License (CAL-1.0)](https://github.com/holochain/cryptographic-autonomy-license).

## Status

🚧 Phase 1: Decentralised Foundations & Migration — in development.

## Architecture

See [PLAN.md](./PLAN.md) for the full project plan and [IMPLEMENTATION.md](./IMPLEMENTATION.md) for Phase 1 module specs.

## Packages

| Package | Description |
|---------|-------------|
| `@harmony/crypto` | Key generation, signing, verification, encryption |
| `@harmony/quads` | RDF quad store interface + implementations |
| `@harmony/vocab` | Harmony RDF vocabulary (ontology) |
| `@harmony/did` | DID creation, resolution, document management |
| `@harmony/vc` | Verifiable Credential issuance, verification, revocation |
| `@harmony/zcap` | Authorization capabilities, delegation, invocation |
| `@harmony/identity` | Composite identity manager (DID + VC + recovery + sync) |
| `@harmony/migration` | Discord export parsing and RDF transformation |
| `@harmony/migration-bot` | Discord bot for community server export |
| `@harmony/cloud` | Identity service, encrypted storage, OAuth gateway |
| `@harmony/cli` | Command-line interface |

## Development

```bash
pnpm install
pnpm -r test
pnpm -r check
```

## License

CAL-1.0 — see [LICENSE](./LICENSE).
