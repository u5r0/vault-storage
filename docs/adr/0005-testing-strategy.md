# ADR 0005: Testing strategy — Epic Web testing trophy, API-level e2e first

**Status:** Accepted
**Date:** 2026-05-17

## Context

Gap #1 says "no tests." The `BlobStore` interface was designed for
testability but nothing has ever been tested. Before writing the first
line, we need to agree on:

- What kind of tests to invest in.
- What test runner / fixtures.
- Where the boundary of an "integration" or "e2e" test sits.

The team is leaning on Kent C. Dodds's "Epic Web" testing methodology as a
reference philosophy.

## Reference philosophy: the testing trophy

Kent C. Dodds's well-known reframing of the test pyramid:

```
              /\
             /e2e\        ← few, expensive, full-stack
            /------\
           / integ. \     ← LARGEST tier — test through public boundaries
          /----------\
         /   unit     \   ← only for genuinely-isolated logic
        /--------------\
       /    static      \ ← types, lint
      /------------------\
```

Distilled rules we are adopting:

1. **"Write tests. Not too many. Mostly integration."** Integration tests
   sit at the API boundary and give the highest confidence per test.
2. **Avoid mocks when a real dependency is cheap.** Mocks lie. A real
   dependency that takes 200ms to start (e.g., Azurite in-memory) is worth
   it.
3. **Test user-observable behaviour, not implementation details.** For an
   HTTP API, the "user" is the HTTP client. We test the wire surface.
4. **One assertion path through each happy path before adding error
   cases.** Tracer bullets first.

## Options considered (recap from chat)

1. **Unit tests for pure functions** — `paths.ts`, `format.ts`, schemas.
2. **Route tests with a fake `BlobStore`** — would require building
   `InMemoryBlobStore`. Mocks the storage layer.
3. **API-level e2e against real Azurite** — full server stack, real Azure
   SDK, in-memory Azurite. *No mocks.*
4. **Browser e2e (Playwright)** — drive the UI through a real browser.

## Decision

**Start with #3 (API-level e2e against Azurite). Layer #1 and #4 on top
later. Skip #2.**

### Why #3 first

- Matches the trophy: integration is the highest-value tier and we have
  zero coverage today.
- Aligns with [ADR 0004](0004-azurite-for-local-dev.md): Azurite already
  validates the Azure code path; we are extending the same approach into
  automated tests.
- The `BlobStore` interface gives us a clean seam — we don't need to mock
  HTTP, we don't need to mock the SDK, we point the real adapter at the
  real (emulated) backend and assert on the HTTP responses.
- Catches the class of bug that mocks cannot catch (case sensitivity,
  metadata round-trips, listing semantics, stream handling).

### Why skip #2

Building `InMemoryBlobStore` as a test fixture would be ~50 lines of code
whose only consumer is the test suite. Azurite in-memory mode boots in
~200ms and exercises the real adapter. The cost difference is small; the
confidence gap is large. ADR 0004 noted that `InMemoryBlobStore` may
become useful later for offline dev or as a self-hosting option — at that
point it'll have a real second consumer and earn its keep.

### Why defer #4 (Playwright)

The UI surface is still volatile (folder navigation, routing, drag-drop,
search are all in flight). Browser e2e is most valuable when the UI has
stabilised. We will add one happy-path Playwright spec once the file
browser interactions are settled.

### Why add #1 selectively, not exhaustively

Pure-function unit tests are warranted only where the function has
non-obvious edge cases that integration tests would not naturally cover.
Current candidates:

- `server/lib/paths.ts` — `normalizePath`, `toPrefix`, `isSafeName`,
  `joinName`. Path handling is the kind of thing where subtle bugs hide
  (trailing slashes, `..` traversal, empty strings, Unicode).
- `app/lib/format.ts` — `fileIconType`, `formatSize`. Edge cases around
  unknown MIME types and zero-byte files.

SDK Zod schemas are self-validating; no separate unit tests.

## Implementation plan

### Phase A — Foundation (this milestone)

1. **Add Vitest** to root devDeps. Vue/Vite-native, fast, TS works.
2. **Create `vitest.config.ts`** with two projects:
   - `unit` — picks up `**/*.test.ts` co-located with source.
   - `integration` — picks up `tests/integration/**/*.test.ts`, longer
     timeout, global setup/teardown for Azurite.
3. **Global setup** spawns Azurite in in-memory mode on a random port,
   sets `AZURE_STORAGE_CONNECTION_STRING` for the test process. Teardown
   stops it.
4. **First integration test**: `tests/integration/files.test.ts`. Tests
   the full happy path of every route by calling the Hono app via
   `app.request(...)` (no socket, no port allocation):
   - `GET /api/files` empty
   - `POST /api/files/folder` → folder visible in list
   - `POST /api/files/upload` → file visible with correct metadata
   - `GET /api/files/download` → bytes match
   - `PATCH /api/files/rename` → old path gone, new path present
   - `DELETE /api/files` (file) → gone
   - `DELETE /api/files` (folder) → folder and children gone
5. **First unit test**: `server/lib/paths.test.ts` — edge cases for path
   helpers.
6. **CI hook later** (gap #16): `pnpm test` runs both projects.

### Phase B — Coverage

- Error-path tests: 404s, validation failures, oversized uploads, name
  collisions, traversal attempts.
- `app/lib/format.test.ts` — `fileIconType` mapping, size/date formatting
  edge cases.
- SDK request-validation round-trips (if we hit drift).

### Phase C — Browser e2e

- Playwright config with one happy-path spec: load app, see seeded data,
  navigate folder, open file details.
- Runs against `pnpm dev` (or a `test:e2e` variant that uses an isolated
  Azurite + seeded data).

## Consequences

### Positive

- Highest-confidence tests come first.
- Tests exercise the same code path as production.
- Adding new routes is naturally test-driven from day one.
- Sets the team norm: "integration first, mock only when real is hard."

### Negative

- Slower per test than mocked unit tests (~50-200ms vs ~5ms).
- Test process needs Azurite running — extra setup complexity.
- Test failures can have more causes (Azurite hiccup, SDK version, real
  adapter bug). Trade-off accepted for the confidence.

### Neutral

- We will *not* aim for 100% line coverage. Coverage is a tool, not a
  goal. We aim for "every route happy path + every gnarly utility +
  critical error paths."

## References

- [Kent C. Dodds, "The Testing Trophy and Testing Classifications"](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Kent C. Dodds, "Write tests. Not too many. Mostly integration."](https://kentcdodds.com/blog/write-tests)
- [Vitest](https://vitest.dev)
- [ADR 0004](0004-azurite-for-local-dev.md) — Azurite as dev/test backend.
- Gap analysis: gap #1 (no tests).
