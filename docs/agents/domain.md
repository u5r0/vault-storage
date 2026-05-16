# Domain Documentation

This repo uses a **multi-context** layout with separate domain documentation for frontend and backend.

## Context Map

- **Frontend** (`app/`): Vue.js application
  - Context: `app/CONTEXT.md`
  - ADRs: `app/docs/adr/`
  
- **Backend** (`server/`): Node.js API server
  - Context: `server/CONTEXT.md`
  - ADRs: `server/docs/adr/`

## Consumer Rules

When working on a feature or debugging:

1. **Identify the context** — which part of the codebase (frontend/backend)?
2. **Read the relevant `CONTEXT.md`** to understand domain language and key concepts
3. **Check ADRs** in that context's `docs/adr/` for past architectural decisions
4. **Use the domain glossary** from `CONTEXT.md` when exploring code or writing issues

If a feature spans both contexts, read both `CONTEXT.md` files.

## Creating Context Files

If `CONTEXT.md` or `docs/adr/` don't exist yet in a context, create them:

- `CONTEXT.md` should define domain terms, key abstractions, and system boundaries
- `docs/adr/` should contain numbered ADRs following the format: `NNNN-title.md`
