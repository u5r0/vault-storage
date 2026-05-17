# tests/

Cross-cutting test fixtures and integration suites. See [ADR 0005](../docs/adr/0005-testing-strategy.md) for the full strategy.

## Layout

```
tests/
  setup/
    azurite.global.ts   Vitest globalSetup — spawns Azurite once per run
    azurite.env.ts      Per-worker setupFiles — sets AZURE_STORAGE_* env
  integration/
    files.test.ts       Happy-path coverage of /api/files routes
```

Unit tests live next to the code they cover (e.g. `apps/server/src/lib/paths.test.ts`).

## Running

```bash
pnpm test               # unit + integration
pnpm test:unit          # vitest run --project unit
pnpm test:integration   # vitest run --project integration
pnpm test:watch         # interactive
```

Integration runs spawn `azurite-blob --inMemoryPersistence` on a random free port. No host Azurite or persisted data needed.

## Adding tests

- **Pure-function logic** → unit test co-located with source.
- **HTTP behaviour or anything that touches the BlobStore** → integration test under `tests/integration/`. Import `createApp` lazily from `apps/server/src/app.ts` inside `beforeAll` (so per-worker env is set first) and call `app.request(...)`.
- Reset container state in `beforeEach` with `store.deletePrefix("")`.

## Conventions

- **Explicit imports, no Vitest globals.** Always `import { describe, it, expect, ... } from "vitest"`. We do not set `test.globals` and do not add `"vitest/globals"` to any tsconfig `types` array. See [ADR 0005 § Style decision](../docs/adr/0005-testing-strategy.md#style-decision-explicit-imports-no-vitest-globals).
- **TypeScript project**: `tsconfig.test.json` owns this directory, `vitest.config.ts`, and all co-located `*.test.ts`. If you add a new test location, extend its `include`.
