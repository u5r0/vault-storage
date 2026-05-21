# Contributing to Vault Storage

## Getting Started

```bash
pnpm install
cp .env.example .env
pnpm dev        # starts Azurite, Cosmos emulator, API, and web
pnpm seed       # optional — creates demo@vault.app / demo123456
```

## Tests

```bash
pnpm test              # all
pnpm test:unit         # no infrastructure needed
pnpm test:integration  # requires Docker (Azurite + Cosmos emulator)
```

## Before You Code

Read the relevant ADRs in [`docs/adr/`](docs/adr/):

- **[ADR 0008](docs/adr/0008-application-architecture.md)** — full architecture reference (backend layers, frontend modules, SDK contract, conventions)
- [ADR 0004](docs/adr/0004-testing-strategy.md) — testing strategy
- [ADR 0001](docs/adr/0001-authentication.md) — auth system
- [ADR 0006](docs/adr/0006-cosmos-db-and-id-based-routing.md) — database and routing

See [docs/roadmap.md](docs/roadmap.md) for current priorities.

## Submitting Changes

1. `pnpm test` must pass
2. Open a PR with a description of what changed and why
3. Screenshots for UI changes

## Security

Never commit secrets. Use environment variables — see `.env.example`.
