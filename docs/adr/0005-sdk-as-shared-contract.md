# ADR 0005: SDK as Shared Contract

**Status:** Accepted
**Date:** 2026-05-16

## Decision

The SDK owns the full wire contract between frontend and backend. All request bodies, response shapes, and entity types are defined as Zod schemas in the `@vault/sdk` package.

## Technical Details

**SDK Responsibilities:**
- All TypeScript types and interfaces
- Zod schemas for validation
- API client methods
- Type-safe request/response contracts

**Backend:**
- Imports types and schemas from SDK
- Uses Zod schemas for request validation
- Returns SDK-defined types in responses

**Frontend:**
- Imports types from SDK
- Uses SDK client for API calls
- No duplicate type definitions

## Consequences

**Positive:**
- Single source of truth for API contract
- Type safety across full stack
- No contract drift between frontend and backend
- Easier to maintain API changes

**Negative:**
- SDK changes require coordination across packages
- More complex release process for contract changes

## References

- Private ADR: `docs/adr-private/0001-sdk-as-shared-contract.md`
