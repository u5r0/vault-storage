# Context Map

This repository has multiple contexts:

## Frontend (`apps/web/`)
Vue.js application for the vault storage UI.

**Domain docs:** `apps/web/src/CONTEXT.md`  
**ADRs:** `docs/adr/`

## Backend (`apps/server/`)
Node.js API server with Azure Blob Storage integration.

**Domain docs:** `apps/server/src/CONTEXT.md`  
**ADRs:** `docs/adr/`

## Shared (`packages/sdk/`)
Wire-contract package (Zod schemas + typed client) consumed by both apps. See [ADR 0001](docs/adr/0001-sdk-as-shared-contract.md).
