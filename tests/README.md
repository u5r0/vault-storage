# tests/

Reserved for **cross-cutting** tests that span multiple packages or require a fully running server over the network. See [ADR 0017](../docs/adr/0017-test-layout-co-location.md) for the rationale.

## What lives here

```
tests/
  e2e/      ← Playwright end-to-end tests (deferred — see ADR 0016 § "Not Doing")
  README.md
```

## Where tests actually live

All tests are co-located with the code they exercise, inside the package they belong to:

| Test type | Location | Vitest project |
|---|---|---|
| Server unit (services, lib, middleware) | `apps/server/src/**/*.test.ts` | `unit` |
| Server integration (HTTP surface, real Cosmos + Azurite) | `apps/server/src/controllers/*.test.ts` | `integration` |
| Server test infrastructure | `apps/server/src/__setup__/` | (setup files) |
| Frontend unit (components, composables, stores) | `apps/web/src/**/*.test.ts` | `unit` |
| SDK | `packages/sdk/src/**/*.test.ts` | `unit` |

## Running

```bash
pnpm test                        # unit + integration
pnpm vitest run --project unit   # unit only (no infrastructure needed)
pnpm vitest run --project integration  # requires docker compose up
```

## Adding tests

- **Server business logic** → co-locate in `apps/server/src/services/` or `lib/` as `*.test.ts`. Mock the DB.
- **Server HTTP surface** → co-locate in `apps/server/src/controllers/` as `*.test.ts`. Uses real Azurite + Cosmos emulator via `__setup__/`.
- **Frontend** → co-locate with the component/composable/store under `apps/web/src/`.
- **True cross-cutting or full-stack e2e** → add to `tests/e2e/` with its own config.
