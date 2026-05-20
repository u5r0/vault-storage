# ADR 0004: Testing Strategy

**Status:** Accepted
**Date:** 2026-05-17
**Updated:** 2026-05-20

## Decision

Adopt the Epic Web testing trophy methodology with API-level e2e tests as the primary testing tier, following Epic Web testing principles.

## Epic Web Testing Principles

Based on Artem Zakharchenko's testing articles:

1. **Test Intentions, Not Implementation Details**
   - Users don't care how features work, neither should tests
   - Focus on what the code does (intention), not how (implementation)

2. **Golden Rule of Assertions**
   - A test must fail if, and only if, the intention behind the system is not met
   - Don't test implementation details like specific function calls

3. **Implicit Assertions**
   - Skip redundant assertions - many things are implicitly validated
   - If a 200 response is received, the endpoint exists, auth works, etc.

4. **Test Boundaries**
   - Draw boundaries at HTTP requests, side effects, non-deterministic values
   - Don't over-mock or you'll test nothing

## Technical Details

**Test Runner:** Vitest with two projects:
- Unit: Fast, co-located tests for pure functions
- Integration: API-level e2e against Azurite in-memory

**Integration Tests:**
- Full Hono app stack via `app.request(...)`
- Real Azure SDK against Azurite in-memory mode
- No mocks for storage layer
- Cookie handling for session tests
- Centralized fixtures for common setup (`tests/fixtures.ts`)
- Mock email functions at module boundary (not real SMTP/Mailpit)

**Test Organization:**
- `tests/integration/` - API-level e2e tests
- `apps/server/src/**/*.test.ts` - Co-located unit tests
- `tests/fixtures.ts` - Centralized test fixtures

**Testing Philosophy:**
- Test user-facing intentions, not implementation details
- Happy path flows first, then critical error paths
- Remove tests that validate implementation details (e.g., Zod schema validation, granular error paths)
- Use implicit assertions where appropriate
- Global setup for infrastructure, per-test cleanup for data

## Consequences

**Positive:**
- Highest-confidence tests first
- Tests exercise production code path
- Catches bugs that mocks cannot catch
- Aligns with modern testing best practices
- Faster tests with mocked email functions
- Better maintainability with centralized fixtures

**Negative:**
- Slower per test than mocked unit tests
- Requires Azurite running for integration tests

## References

- Private ADR: `docs/adr-private/0005-testing-strategy.md`
- Private ADR: `docs/adr-private/0012b-testing-refactoring-epic-web-patterns.md`
- Kent C. Dodds: "The Testing Trophy"
- Epic Web Testing Fundamentals: https://github.com/epicweb-dev/testing-fundamentals
